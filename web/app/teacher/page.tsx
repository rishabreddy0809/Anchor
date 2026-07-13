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
type Ping = { ts: number; topic: string; summary: string };
type StudentSignal = { studentId: string; ts: number; topic: string; summary: string };

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

function buildTopicCounts(pings: Ping[]) {
  const counts = new Map<string, number>();
  for (const ping of pings) {
    if (!ping.topic) continue;
    counts.set(ping.topic, (counts.get(ping.topic) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([topic, count]) => ({ topic, count }))
    .sort((a, b) => b.count - a.count);
}

type ConnectionState = "connecting" | "connected" | "error";

export default function TeacherDashboard() {
  const [sessionCode, setSessionCode] = useState<string | null>(null);
  const [classNameInput, setClassNameInput] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const [pings, setPings] = useState<Ping[]>([]);
  const [studentSignals, setStudentSignals] = useState<StudentSignal[]>([]);
  const [peerMatchError, setPeerMatchError] = useState(false);
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
        if (!res.ok) {
          const result = (await res.json().catch(() => ({}))) as { error?: string };
          setAudioError(result.error || "Live transcription could not process this audio chunk.");
          return;
        }
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
      setDoc(doc(db, "sessions", sessionCode), { liveTranscript }, { merge: true }).catch(() => {
        setAudioError("The live transcript could not sync to students. Check the Firestore session permissions.");
      });
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
        const nextPings = snapshot.docs
          .map((d) => {
            const data = d.data() as { createdAt?: Timestamp; topic?: string; summary?: string };
            const ts = data.createdAt ? data.createdAt.toMillis() : null;
            if (ts === null) return null;
            return { ts, topic: data.topic ?? "", summary: data.summary ?? "" };
          })
          .filter((p): p is Ping => p !== null);
        setPings(nextPings);
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

  useEffect(() => {
    if (!sessionCode) return;

    setPeerMatchError(false);
    let unsubscribed = false;
    const fifteenMinAgo = Timestamp.fromMillis(Date.now() - FIFTEEN_MIN_MS);
    const studentsQuery = query(
      collection(db, "sessions", sessionCode, "students"),
      where("lastCatchUpAt", ">=", fifteenMinAgo),
      orderBy("lastCatchUpAt", "desc")
    );

    const unsubscribe = onSnapshot(
      studentsQuery,
      (snapshot) => {
        if (unsubscribed) return;
        const nextStudents = snapshot.docs
          .map((studentDoc) => {
            const data = studentDoc.data() as {
              studentId?: string;
              lastCatchUpAt?: Timestamp;
              topic?: string;
              summary?: string;
            };
            const ts = data.lastCatchUpAt?.toMillis();
            if (ts === undefined) return null;
            return {
              studentId: data.studentId || studentDoc.id,
              ts,
              topic: data.topic?.trim() || "General",
              summary: data.summary ?? "",
            };
          })
          .filter((student): student is StudentSignal => student !== null);
        setStudentSignals(nextStudents);
        setPeerMatchError(false);
      },
      () => {
        if (!unsubscribed) setPeerMatchError(true);
      }
    );

    return () => {
      unsubscribed = true;
      unsubscribe();
    };
  }, [sessionCode]);

  const catchUpsLastFiveMin = useMemo(
    () => pings.filter((p) => p.ts >= now - FIVE_MIN_MS).length,
    [pings, now]
  );

  const pingTimes = useMemo(() => pings.map((p) => p.ts), [pings]);
  const chartData = useMemo(() => buildBuckets(pingTimes, now), [pingTimes, now]);
  const hasAnyPings = pings.length > 0;

  const topicCounts = useMemo(() => buildTopicCounts(pings), [pings]);
  const peerMatches = useMemo(() => {
    const studentsByTopic = new Map<string, Set<string>>();
    for (const student of studentSignals) {
      const students = studentsByTopic.get(student.topic) ?? new Set<string>();
      students.add(student.studentId);
      studentsByTopic.set(student.topic, students);
    }
    return Array.from(studentsByTopic.entries())
      .map(([topic, students]) => ({ topic, count: students.size }))
      .filter(({ count }) => count >= 2)
      .sort((a, b) => b.count - a.count);
  }, [studentSignals]);

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

        <section className="signal-card mt-8">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold tracking-[0.22em] text-gold">KNOWLEDGE GRAPH</p>
              <h2 className="mt-3 font-serif text-2xl tracking-[-0.03em] text-stone-50">
                Topics students are stuck on · last 15 min
              </h2>
            </div>
          </div>

          <div className="mt-8">
            {topicCounts.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-3 py-10 text-center">
                <span className="status-pill">
                  <span className="status-dot" />
                  Live
                </span>
                <p className="text-lg text-stone-400">No topics flagged yet.</p>
              </div>
            ) : (
              <ul className="flex flex-col gap-3">
                {topicCounts.map(({ topic, count }) => (
                  <li
                    key={topic}
                    className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.03] px-5 py-4"
                  >
                    <span className="font-serif text-lg tracking-[-0.01em] text-stone-50">{topic}</span>
                    <span className="text-sm font-semibold text-gold">
                      {count} student{count === 1 ? "" : "s"} confused
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        <section className="signal-card mt-8">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-semibold tracking-[0.22em] text-gold">PEER MATCHES</p>
              <h2 className="mt-3 font-serif text-2xl tracking-[-0.03em] text-stone-50">
                Students who may benefit from reviewing together
              </h2>
            </div>
            <span className="text-xs text-stone-500">Anonymous · last 15 min</span>
          </div>

          <div className="mt-8">
            {peerMatchError ? (
              <div className="rounded-2xl border border-amber-400/25 bg-amber-400/[0.06] px-5 py-4 text-sm text-amber-200">
                Peer matches could not sync. Check the Firestore students collection permissions.
              </div>
            ) : peerMatches.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-3 py-10 text-center">
                <span className="status-pill">
                  <span className="status-dot" />
                  Watching topics
                </span>
                <p className="text-lg text-stone-400">Matches appear when two or more students request help on the same topic.</p>
              </div>
            ) : (
              <ul className="grid gap-3 md:grid-cols-2">
                {peerMatches.map(({ topic, count }) => (
                  <li key={topic} className="rounded-2xl border border-gold/20 bg-gold/[0.04] px-5 py-5">
                    <p className="font-serif text-xl tracking-[-0.02em] text-stone-50">{topic}</p>
                    <p className="mt-2 text-sm text-stone-400">
                      {count} students are reviewing this concept
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
