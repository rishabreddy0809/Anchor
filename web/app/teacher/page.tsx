"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Timestamp,
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  where,
} from "firebase/firestore";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { db } from "../../lib/firebase";

const FIVE_MIN_MS = 5 * 60 * 1000;
const FIFTEEN_MIN_MS = 15 * 60 * 1000;
const THREE_MIN_MS = 3 * 60 * 1000;
const BUCKET_MS = 60 * 1000;
const BUCKET_COUNT = 15;
const TRANSCRIPT_SYNC_MS = 4000;
const RECORDING_CHUNK_MS = 7000;

type TranscriptChunk = { text: string; ts: number };

function generateSessionCode() {
  const letters = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const digits = "0123456789";
  let code = "";
  for (let i = 0; i < 3; i++) code += letters[Math.floor(Math.random() * letters.length)];
  for (let i = 0; i < 3; i++) code += digits[Math.floor(Math.random() * digits.length)];
  return code;
}

function buildBuckets(pingTimes: number[], now: number) {
  const bucketStart = Math.floor(now / BUCKET_MS) * BUCKET_MS - (BUCKET_COUNT - 1) * BUCKET_MS;
  const buckets = Array.from({ length: BUCKET_COUNT }, (_, i) => {
    const start = bucketStart + i * BUCKET_MS;
    return { start, count: 0 };
  });

  for (const t of pingTimes) {
    const idx = Math.floor((t - bucketStart) / BUCKET_MS);
    if (idx >= 0 && idx < BUCKET_COUNT) buckets[idx].count += 1;
  }

  return buckets.map((b) => ({
    label: new Date(b.start).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }),
    count: b.count,
  }));
}

type ConnectionState = "connecting" | "connected" | "error";

export default function TeacherDashboard() {
  const [sessionCode, setSessionCode] = useState<string | null>(null);
  const [classNameInput, setClassNameInput] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const [pingTimes, setPingTimes] = useState<number[]>([]);
  const [connectionState, setConnectionState] = useState<ConnectionState>("connecting");
  const [now, setNow] = useState(() => Date.now());

  const [audioState, setAudioState] = useState<"idle" | "requesting" | "active">("idle");
  const [audioError, setAudioError] = useState<string | null>(null);
  const displayStreamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const transcriptChunksRef = useRef<TranscriptChunk[]>([]);
  const syncIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(tick);
  }, []);

  function stopCapture() {
    try {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
        mediaRecorderRef.current.stop();
      }
    } catch {
      // already stopped
    }
    mediaRecorderRef.current = null;
    if (syncIntervalRef.current) {
      clearInterval(syncIntervalRef.current);
      syncIntervalRef.current = null;
    }
    displayStreamRef.current?.getTracks().forEach((track) => track.stop());
    displayStreamRef.current = null;
    transcriptChunksRef.current = [];
    setAudioState("idle");
  }

  useEffect(() => {
    return () => {
      try {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
          mediaRecorderRef.current.stop();
        }
      } catch {
        // already stopped
      }
      displayStreamRef.current?.getTracks().forEach((track) => track.stop());
      if (syncIntervalRef.current) clearInterval(syncIntervalRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleShareTabAudio() {
    if (!sessionCode || audioState !== "idle") return;
    setAudioError(null);
    setAudioState("requesting");

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
    } catch (err) {
      setAudioState("idle");
      const name = err instanceof DOMException ? err.name : "";
      if (name !== "NotAllowedError" && name !== "AbortError") {
        setAudioError("Couldn't start tab audio sharing. Please try again.");
      }
      return;
    }

    if (stream.getAudioTracks().length === 0) {
      stream.getTracks().forEach((track) => track.stop());
      setAudioState("idle");
      setAudioError('No audio was captured — when sharing, make sure to check "Share tab audio."');
      return;
    }

    if (!MediaRecorder.isTypeSupported("audio/webm")) {
      stream.getTracks().forEach((track) => track.stop());
      setAudioState("idle");
      setAudioError("This browser doesn't support the audio format needed for transcription. Try Chrome.");
      return;
    }

    displayStreamRef.current = stream;
    stream.getVideoTracks()[0]?.addEventListener("ended", stopCapture);

    const audioStream = new MediaStream(stream.getAudioTracks());
    const recorder = new MediaRecorder(audioStream, { mimeType: "audio/webm" });

    recorder.ondataavailable = async (event) => {
      if (event.data.size === 0) return;
      try {
        const formData = new FormData();
        formData.append("audio", event.data, "chunk.webm");
        const res = await fetch("/api/transcribe", { method: "POST", body: formData });
        if (!res.ok) return;
        const { text } = (await res.json()) as { text?: string };
        if (text && text.trim()) {
          transcriptChunksRef.current.push({ text: text.trim(), ts: Date.now() });
        }
      } catch {
        // drop this chunk, keep the pipeline running
      }
    };

    recorder.onerror = () => {
      setAudioError("Recording failed, so live transcription stopped.");
      stopCapture();
    };

    mediaRecorderRef.current = recorder;
    recorder.start(RECORDING_CHUNK_MS);

    syncIntervalRef.current = setInterval(() => {
      const cutoff = Date.now() - THREE_MIN_MS;
      transcriptChunksRef.current = transcriptChunksRef.current.filter((chunk) => chunk.ts >= cutoff);
      const liveTranscript = transcriptChunksRef.current.map((chunk) => chunk.text).join(" ");
      setDoc(doc(db, "sessions", sessionCode), { liveTranscript }, { merge: true }).catch(() => {});
    }, TRANSCRIPT_SYNC_MS);

    setAudioState("active");
  }

  useEffect(() => {
    if (!sessionCode) return;

    setConnectionState("connecting");
    let unsubscribed = false;

    const fifteenMinAgo = Timestamp.fromMillis(Date.now() - FIFTEEN_MIN_MS);
    const pingsQuery = query(
      collection(db, "sessions", sessionCode, "pings"),
      where("createdAt", ">=", fifteenMinAgo),
      orderBy("createdAt", "asc")
    );

    const unsubscribe = onSnapshot(
      pingsQuery,
      (snapshot) => {
        if (unsubscribed) return;
        setConnectionState("connected");
        const times = snapshot.docs
          .map((d) => {
            const ts = d.data().createdAt as Timestamp | undefined;
            return ts ? ts.toMillis() : null;
          })
          .filter((t): t is number => t !== null);
        setPingTimes(times);
      },
      () => {
        if (!unsubscribed) setConnectionState("error");
      }
    );

    return () => {
      unsubscribed = true;
      unsubscribe();
    };
  }, [sessionCode]);

  const catchUpsLastFiveMin = useMemo(
    () => pingTimes.filter((t) => t >= now - FIVE_MIN_MS).length,
    [pingTimes, now]
  );

  const chartData = useMemo(() => buildBuckets(pingTimes, now), [pingTimes, now]);
  const hasAnyPings = pingTimes.length > 0;

  async function handleCreateSession(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setCreateError(null);
    const code = generateSessionCode();
    try {
      await setDoc(doc(db, "sessions", code), {
        className: classNameInput.trim(),
        createdAt: serverTimestamp(),
      });
      setSessionCode(code);
    } catch {
      setCreateError("Couldn't create the session. Check your connection and try again.");
    } finally {
      setCreating(false);
    }
  }

  if (!sessionCode) {
    return (
      <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-ink">
        <div
          className="pointer-events-none absolute inset-0 z-0"
          style={{ background: "radial-gradient(circle at 50% 30%, rgba(224,169,74,0.09), transparent 55%)" }}
        />
        <div className="relative z-10 w-full max-w-md px-6 text-center">
          <a href="/" className="font-serif text-xl tracking-[-0.04em] text-stone-50">
            Anchor<span className="text-gold">.</span>
          </a>
          <p className="eyebrow mt-8">TEACHER DASHBOARD</p>
          <h1 className="section-title mt-5 text-4xl">Start a live session</h1>
          <p className="mt-5 text-base leading-7 text-stone-400">
            Give your class a name and start a session. Students will use the code to join.
          </p>

          <form onSubmit={handleCreateSession} className="mt-8 flex flex-col items-center gap-4">
            <input
              value={classNameInput}
              onChange={(e) => setClassNameInput(e.target.value)}
              placeholder="Class name (e.g. AP Biology, Period 3)"
              className="w-full rounded-full border border-white/10 bg-white/[0.03] px-5 py-3 text-center text-sm text-stone-200 placeholder:text-stone-600 focus:border-gold/60 focus:outline-none"
              maxLength={60}
            />
            <button type="submit" disabled={creating} className="button button-primary w-full disabled:opacity-60">
              {creating ? "Creating…" : "Create Session"}
            </button>
          </form>

          {createError && (
            <div className="mt-6 rounded-2xl border border-red-500/30 bg-red-500/[0.06] px-5 py-3 text-sm text-red-300">
              {createError}
            </div>
          )}
        </div>
      </main>
    );
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-ink">
      <div
        className="pointer-events-none absolute inset-0 z-0"
        style={{ background: "radial-gradient(circle at 50% 0%, rgba(224,169,74,0.09), transparent 55%)" }}
      />

      <div className="section-shell relative z-10 flex min-h-screen max-w-5xl flex-col pb-16 pt-10 md:pt-14">
        <header className="flex flex-col items-center gap-6 text-center">
          <a href="/" className="font-serif text-xl tracking-[-0.04em] text-stone-50">
            Anchor<span className="text-gold">.</span>
          </a>

          <div className="flex flex-col items-center gap-3">
            <p className="eyebrow">TEACHER DASHBOARD</p>
            <div className="flex flex-wrap items-center justify-center gap-4">
              <span className="font-serif text-5xl tracking-[-0.03em] text-stone-50 sm:text-6xl">
                {sessionCode}
              </span>
              <span className="status-pill">
                <span
                  className="status-dot"
                  style={connectionState !== "connected" ? { animation: "none", opacity: 0.4 } : undefined}
                />
                {connectionState === "connected" && "Live"}
                {connectionState === "connecting" && "Connecting…"}
                {connectionState === "error" && "Connection error"}
              </span>
              {audioState === "active" && (
                <span className="status-pill">
                  <span className="status-dot" />
                  Capturing Audio
                </span>
              )}
            </div>
            <p className="max-w-md text-sm leading-6 text-stone-400">
              Have students enter this code in Anchor to join the session.
            </p>

            <button
              type="button"
              onClick={audioState === "active" ? stopCapture : handleShareTabAudio}
              disabled={audioState === "requesting"}
              className="button button-secondary text-sm disabled:opacity-60"
            >
              {audioState === "active" && "Stop Sharing"}
              {audioState === "requesting" && "Requesting…"}
              {audioState === "idle" && "Share Tab Audio"}
            </button>
            <p className="max-w-sm text-xs leading-5 text-stone-500">
              Select your Zoom/Meet tab and check &quot;Share tab audio&quot; to enable live transcription.
            </p>
          </div>
        </header>

        {audioError && (
          <div className="mx-auto mt-6 max-w-lg rounded-2xl border border-red-500/30 bg-red-500/[0.06] px-5 py-3 text-center text-sm text-red-300">
            {audioError}
          </div>
        )}

        {connectionState === "error" && (
          <div className="mx-auto mt-8 max-w-lg rounded-2xl border border-red-500/30 bg-red-500/[0.06] px-5 py-3 text-center text-sm text-red-300">
            Couldn&apos;t reach the live session. Check your connection — this page will keep retrying automatically.
          </div>
        )}

        <section className="mt-14 flex flex-col items-center text-center">
          <p className="eyebrow">STUDENTS LOST RIGHT NOW</p>
          <p className="hero-gold mt-4 font-serif text-[clamp(5rem,16vw,10rem)] font-medium leading-none tracking-[-0.04em] text-gold">
            {catchUpsLastFiveMin}
          </p>
        </section>

        <section className="signal-card mt-14">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold tracking-[0.22em] text-gold">CONFUSION SPIKES</p>
              <h2 className="mt-3 font-serif text-2xl tracking-[-0.03em] text-stone-50">
                Catch-ups per minute · last 15 min
              </h2>
            </div>
          </div>

          <div className="mt-8 h-72">
            {!hasAnyPings ? (
              <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
                <span className="status-pill">
                  <span className="status-dot" />
                  Live
                </span>
                <p className="text-lg text-stone-400">Waiting for students to join…</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.07)" vertical={false} />
                  <XAxis
                    dataKey="label"
                    stroke="rgba(255,255,255,0.35)"
                    tick={{ fill: "#a8a29e", fontSize: 12 }}
                    tickLine={false}
                    axisLine={{ stroke: "rgba(255,255,255,0.1)" }}
                    interval={2}
                  />
                  <YAxis
                    allowDecimals={false}
                    stroke="rgba(255,255,255,0.35)"
                    tick={{ fill: "#a8a29e", fontSize: 12 }}
                    tickLine={false}
                    axisLine={false}
                    width={32}
                  />
                  <Tooltip
                    cursor={{ fill: "rgba(224,169,74,0.08)" }}
                    contentStyle={{
                      background: "#17110a",
                      border: "1px solid rgba(224,169,74,0.25)",
                      borderRadius: "0.75rem",
                      color: "#f5f5f4",
                    }}
                    labelStyle={{ color: "#e0a94a", fontWeight: 600 }}
                  />
                  <Bar dataKey="count" name="Catch-ups" fill="#e0a94a" radius={[6, 6, 0, 0]} maxBarSize={36} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
