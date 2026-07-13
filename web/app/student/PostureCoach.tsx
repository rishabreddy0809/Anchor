"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { NormalizedLandmark, PoseLandmarker } from "@mediapipe/tasks-vision";
import "./posture-coach.css";

type CoachMode = "off" | "loading" | "calibrating" | "tracking" | "blocked" | "error";
type FeedbackLevel = "good" | "steady" | "adjust" | "searching";

type PoseFeatures = {
  shoulderTilt: number;
  torsoLean: number;
  headOffset: number;
  headHeight: number;
  compression: number;
};

type Feedback = {
  score: number;
  level: FeedbackLevel;
  cue: string;
};

const MODEL_PATH = "/mediapipe/models/pose_landmarker_lite.task";
const WASM_PATH = "/mediapipe/wasm";
const CALIBRATION_SAMPLES = 24;
const INFERENCE_INTERVAL_MS = 90;
const KEY_LANDMARKS = [0, 11, 12, 23, 24];
const SKELETON_CONNECTIONS: Array<[number, number]> = [
  [7, 8], [7, 11], [8, 12], [11, 12], [11, 23], [12, 24], [23, 24],
  [11, 13], [13, 15], [12, 14], [14, 16], [23, 25], [25, 27], [24, 26], [26, 28],
];

function distance(a: NormalizedLandmark, b: NormalizedLandmark) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function midpoint(a: NormalizedLandmark, b: NormalizedLandmark) {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

function extractFeatures(landmarks: NormalizedLandmark[]): PoseFeatures | null {
  if (landmarks.length < 25) return null;
  const visible = KEY_LANDMARKS.every((index) => (landmarks[index]?.visibility ?? 1) >= 0.55);
  if (!visible) return null;

  const nose = landmarks[0];
  const leftShoulder = landmarks[11];
  const rightShoulder = landmarks[12];
  const leftHip = landmarks[23];
  const rightHip = landmarks[24];
  const shoulderMid = midpoint(leftShoulder, rightShoulder);
  const hipMid = midpoint(leftHip, rightHip);
  const shoulderWidth = distance(leftShoulder, rightShoulder);
  const torsoLength = Math.hypot(shoulderMid.x - hipMid.x, shoulderMid.y - hipMid.y);

  if (shoulderWidth < 0.055 || torsoLength < 0.08) return null;

  return {
    shoulderTilt: Math.abs(leftShoulder.y - rightShoulder.y) / shoulderWidth,
    torsoLean: Math.abs(shoulderMid.x - hipMid.x) / torsoLength,
    headOffset: Math.abs(nose.x - shoulderMid.x) / shoulderWidth,
    headHeight: Math.max(0, shoulderMid.y - nose.y) / shoulderWidth,
    compression: torsoLength / shoulderWidth,
  };
}

function median(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function buildBaseline(samples: PoseFeatures[]): PoseFeatures {
  return {
    shoulderTilt: median(samples.map((sample) => sample.shoulderTilt)),
    torsoLean: median(samples.map((sample) => sample.torsoLean)),
    headOffset: median(samples.map((sample) => sample.headOffset)),
    headHeight: median(samples.map((sample) => sample.headHeight)),
    compression: median(samples.map((sample) => sample.compression)),
  };
}

function scorePosture(features: PoseFeatures, baseline: PoseFeatures) {
  const penalties = {
    shoulders: Math.max(0, features.shoulderTilt - baseline.shoulderTilt - 0.025) / 0.16 * 18,
    center: Math.max(0, features.torsoLean - baseline.torsoLean - 0.035) / 0.2 * 20,
    head: Math.max(0, features.headOffset - baseline.headOffset - 0.05) / 0.24 * 20,
    height: Math.max(0, baseline.headHeight - features.headHeight - 0.04) / Math.max(0.22, baseline.headHeight * 0.22) * 17,
    compression: Math.max(0, baseline.compression - features.compression) / Math.max(0.18, baseline.compression * 0.18) * 25,
  };
  const score = Math.max(0, Math.min(100, 100 - Object.values(penalties).reduce((sum, value) => sum + value, 0)));
  const strongest = Object.entries(penalties).sort((a, b) => b[1] - a[1])[0]?.[0];
  const cue = strongest === "shoulders"
    ? "Relax and level your shoulders."
    : strongest === "center"
      ? "Center your torso over your hips."
      : strongest === "head"
        ? "Bring your head back over your shoulders."
        : strongest === "height" || strongest === "compression"
          ? "Lift through your chest and sit a little taller."
          : "Strong alignment. Stay relaxed.";
  return { score, cue };
}

function drawPose(canvas: HTMLCanvasElement, video: HTMLVideoElement, landmarks: NormalizedLandmark[], level: FeedbackLevel) {
  if (!video.videoWidth || !video.videoHeight) return;
  if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
  }
  const context = canvas.getContext("2d");
  if (!context) return;
  context.clearRect(0, 0, canvas.width, canvas.height);
  const color = level === "adjust" ? "#f59e72" : level === "good" ? "#5fe0b1" : "#e4b65b";
  context.lineWidth = Math.max(2, canvas.width / 260);
  context.strokeStyle = color;
  context.fillStyle = color;
  context.shadowColor = color;
  context.shadowBlur = 10;

  for (const [from, to] of SKELETON_CONNECTIONS) {
    const first = landmarks[from];
    const second = landmarks[to];
    if (!first || !second || (first.visibility ?? 1) < 0.45 || (second.visibility ?? 1) < 0.45) continue;
    context.beginPath();
    context.moveTo(first.x * canvas.width, first.y * canvas.height);
    context.lineTo(second.x * canvas.width, second.y * canvas.height);
    context.stroke();
  }

  for (const index of [0, 7, 8, 11, 12, 23, 24]) {
    const point = landmarks[index];
    if (!point || (point.visibility ?? 1) < 0.45) continue;
    context.beginPath();
    context.arc(point.x * canvas.width, point.y * canvas.height, Math.max(3, canvas.width / 150), 0, Math.PI * 2);
    context.fill();
  }
}

export default function PostureCoach({ paused }: { paused: boolean }) {
  const [expanded, setExpanded] = useState(true);
  const [mode, setMode] = useState<CoachMode>("off");
  const [feedback, setFeedback] = useState<Feedback>({ score: 0, level: "searching", cue: "Enable the camera to begin." });
  const [calibrationProgress, setCalibrationProgress] = useState(0);
  const [error, setError] = useState("");
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const landmarkerRef = useRef<PoseLandmarker | null>(null);
  const frameRef = useRef<number>();
  const runningRef = useRef(false);
  const generationRef = useRef(0);
  const baselineRef = useRef<PoseFeatures | null>(null);
  const calibrationSamplesRef = useRef<PoseFeatures[]>([]);
  const smoothScoreRef = useRef(100);
  const badSinceRef = useRef<number | null>(null);
  const lastInferenceRef = useRef(0);
  const lastVideoTimeRef = useRef(-1);

  const dispose = useCallback((updateState = true) => {
    generationRef.current += 1;
    runningRef.current = false;
    if (frameRef.current !== undefined) cancelAnimationFrame(frameRef.current);
    frameRef.current = undefined;
    cameraStreamRef.current?.getTracks().forEach((track) => track.stop());
    cameraStreamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    landmarkerRef.current?.close();
    landmarkerRef.current = null;
    const canvas = canvasRef.current;
    canvas?.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
    baselineRef.current = null;
    calibrationSamplesRef.current = [];
    if (updateState) {
      setMode("off");
      setFeedback({ score: 0, level: "searching", cue: "Camera off. Your privacy is protected." });
      setCalibrationProgress(0);
      setError("");
    }
  }, []);

  useEffect(() => () => dispose(false), [dispose]);

  function recalibrate() {
    if (!landmarkerRef.current) return;
    baselineRef.current = null;
    calibrationSamplesRef.current = [];
    smoothScoreRef.current = 100;
    badSinceRef.current = null;
    setCalibrationProgress(0);
    setFeedback({ score: 100, level: "steady", cue: "Sit naturally upright while Anchor calibrates." });
    setMode("calibrating");
  }

  async function startCoach() {
    if (mode === "loading" || mode === "calibrating" || mode === "tracking") return;
    setExpanded(true);
    setError("");
    setMode("loading");
    setFeedback({ score: 0, level: "searching", cue: "Starting the private posture engine…" });
    const generation = ++generationRef.current;

    try {
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
        throw new Error("Posture tracking needs localhost or HTTPS in Chrome, Edge, or Safari.");
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "user",
          width: { ideal: 640 },
          height: { ideal: 480 },
          frameRate: { ideal: 24, max: 30 },
        },
        audio: false,
      });
      if (generation !== generationRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      cameraStreamRef.current = stream;
      const video = videoRef.current;
      if (!video) throw new Error("The camera preview could not start.");
      video.srcObject = stream;
      await video.play();

      const { FilesetResolver, PoseLandmarker } = await import("@mediapipe/tasks-vision");
      const vision = await FilesetResolver.forVisionTasks(WASM_PATH);
      const options = {
        baseOptions: { modelAssetPath: MODEL_PATH, delegate: "GPU" as const },
        runningMode: "VIDEO" as const,
        numPoses: 1,
        minPoseDetectionConfidence: 0.6,
        minPosePresenceConfidence: 0.6,
        minTrackingConfidence: 0.6,
        outputSegmentationMasks: false,
      };
      let landmarker: PoseLandmarker;
      try {
        landmarker = await PoseLandmarker.createFromOptions(vision, options);
      } catch {
        landmarker = await PoseLandmarker.createFromOptions(vision, {
          ...options,
          baseOptions: { modelAssetPath: MODEL_PATH, delegate: "CPU" },
        });
      }
      if (generation !== generationRef.current) {
        landmarker.close();
        return;
      }
      landmarkerRef.current = landmarker;
      stream.getVideoTracks()[0]?.addEventListener("ended", () => dispose(true), { once: true });
      runningRef.current = true;
      calibrationSamplesRef.current = [];
      baselineRef.current = null;
      setMode("calibrating");
      setFeedback({ score: 100, level: "steady", cue: "Sit naturally upright for a quick calibration." });

      const analyze = (now: number) => {
        if (!runningRef.current || generation !== generationRef.current) return;
        frameRef.current = requestAnimationFrame(analyze);
        if (document.hidden || now - lastInferenceRef.current < INFERENCE_INTERVAL_MS) return;
        if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || video.currentTime === lastVideoTimeRef.current) return;
        lastInferenceRef.current = now;
        lastVideoTimeRef.current = video.currentTime;

        try {
          const result = landmarker.detectForVideo(video, performance.now());
          const landmarks = result.landmarks[0];
          if (!landmarks) {
            setFeedback((current) => ({ ...current, level: "searching", cue: "Move into view so your head, shoulders, and hips are visible." }));
            canvasRef.current?.getContext("2d")?.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
            return;
          }

          const features = extractFeatures(landmarks);
          if (!features) {
            setFeedback((current) => ({ ...current, level: "searching", cue: "Adjust the camera so your head, shoulders, and hips are visible." }));
            drawPose(canvasRef.current!, video, landmarks, "searching");
            return;
          }

          if (!baselineRef.current) {
            calibrationSamplesRef.current.push(features);
            const progress = Math.min(100, Math.round(calibrationSamplesRef.current.length / CALIBRATION_SAMPLES * 100));
            setCalibrationProgress(progress);
            drawPose(canvasRef.current!, video, landmarks, "steady");
            if (calibrationSamplesRef.current.length >= CALIBRATION_SAMPLES) {
              baselineRef.current = buildBaseline(calibrationSamplesRef.current);
              setMode("tracking");
              setFeedback({ score: 100, level: "good", cue: "Calibration locked. Strong posture." });
            }
            return;
          }

          const measured = scorePosture(features, baselineRef.current);
          smoothScoreRef.current = smoothScoreRef.current * 0.78 + measured.score * 0.22;
          const smoothScore = Math.round(smoothScoreRef.current);
          let level: FeedbackLevel = smoothScore >= 82 ? "good" : "steady";
          if (smoothScore < 68) {
            badSinceRef.current ??= now;
            if (now - badSinceRef.current > 1200) level = "adjust";
          } else {
            badSinceRef.current = null;
          }
          const cue = level === "good" ? "Locked in. Keep breathing and stay relaxed." : measured.cue;
          setFeedback({ score: smoothScore, level, cue });
          drawPose(canvasRef.current!, video, landmarks, level);
        } catch {
          setError("Posture analysis paused unexpectedly. Restart the coach to continue.");
          setMode("error");
          runningRef.current = false;
        }
      };
      frameRef.current = requestAnimationFrame(analyze);
    } catch (cause) {
      cameraStreamRef.current?.getTracks().forEach((track) => track.stop());
      cameraStreamRef.current = null;
      const denied = cause instanceof DOMException && (cause.name === "NotAllowedError" || cause.name === "PermissionDeniedError");
      setMode(denied ? "blocked" : "error");
      setError(denied ? "Camera access was declined. Allow it in your browser to use posture coaching." : cause instanceof Error ? cause.message : "The posture coach could not start.");
      setFeedback({ score: 0, level: "searching", cue: "Camera off. Lecture recording is unaffected." });
    }
  }

  const statusLabel = mode === "loading"
    ? "INITIALIZING"
    : mode === "calibrating"
      ? "CALIBRATING"
      : mode === "tracking"
        ? feedback.level === "adjust" ? "ADJUST" : feedback.level === "good" ? "LOCKED IN" : "STEADY"
        : mode === "blocked"
          ? "CAMERA BLOCKED"
          : mode === "error"
            ? "NEEDS ATTENTION"
            : "CAMERA OFF";

  return (
    <aside className={`posture-dock posture-dock--${feedback.level} ${expanded ? "is-expanded" : ""}`} aria-label="On-device posture coach">
      <button type="button" className="posture-dock__header" onClick={() => setExpanded((value) => !value)} aria-expanded={expanded}>
        <span className="posture-orb" style={{ position: "relative", background: `conic-gradient(var(--posture-accent) ${feedback.score}%, rgba(255,255,255,.08) 0)` }}>
          <b>{mode === "tracking" ? feedback.score : "✦"}</b>
        </span>
        <span className="posture-dock__title">
          <b>Posture coach</b>
          <small>Private on-device vision</small>
        </span>
        <span className="posture-chip">{statusLabel}</span>
        <span className="posture-chevron" aria-hidden="true">{expanded ? "⌄" : "⌃"}</span>
      </button>

      {expanded && (
        <div className="posture-dock__body">
          <div className="posture-preview">
            <video ref={videoRef} muted playsInline aria-label="Mirrored posture camera preview" />
            <canvas ref={canvasRef} aria-hidden="true" />
            {mode === "off" && <div className="posture-preview__idle"><i>◎</i><b>Camera stays private</b><small>No frames are saved or uploaded</small></div>}
            {mode === "loading" && <div className="posture-preview__idle"><i className="posture-spinner" /><b>Loading vision engine</b><small>Starting local MediaPipe</small></div>}
            {mode === "calibrating" && <div className="posture-calibration"><span><b style={{ width: `${calibrationProgress}%` }} /></span><small>{calibrationProgress}% calibrated</small></div>}
          </div>

          <div className="posture-readout" aria-live="polite">
            <span>LIVE GUIDANCE</span>
            <p>{error || feedback.cue}</p>
            {paused && mode === "tracking" && <small>Lecture paused · posture tracking continues</small>}
          </div>

          <div className="posture-actions">
            {(mode === "off" || mode === "blocked" || mode === "error") && (
              <button type="button" className="posture-action posture-action--primary" onClick={() => void startCoach()}>Enable posture coach</button>
            )}
            {(mode === "calibrating" || mode === "tracking") && (
              <>
                <button type="button" className="posture-action" onClick={recalibrate}>Recalibrate</button>
                <button type="button" className="posture-action" onClick={() => dispose(true)}>Camera off</button>
              </>
            )}
          </div>
          <p className="posture-privacy">⌾ Runs locally · no recording · no Gemini or GPT</p>
        </div>
      )}
    </aside>
  );
}
