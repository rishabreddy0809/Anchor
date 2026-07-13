"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  doc,
  increment,
  onSnapshot,
  serverTimestamp,
  writeBatch,
} from "firebase/firestore";
import { db } from "../../../lib/firebase";

const STUDENT_ID_KEY = "anchor-student-id";

type SessionState = "idle" | "joining" | "joined" | "not-found" | "error";
type CatchUpState = "idle" | "loading" | "done" | "flagged";
type SyncState = "idle" | "syncing" | "synced" | "error";
type CatchUpSignal = { id: string; summary: string; topic: string };

function getOrCreateStudentId() {
  if (typeof window === "undefined") return "";
  const existing = window.localStorage.getItem(STUDENT_ID_KEY);
  if (existing) return existing;
  const created = crypto.randomUUID();
  window.localStorage.setItem(STUDENT_ID_KEY, created);
  return created;
}

export default function StudentJoinPage() {
  const [studentId, setStudentId] = useState("");
  const [codeInput, setCodeInput] = useState("");
  const [sessionCode, setSessionCode] = useState<string | null>(null);
  const [sessionState, setSessionState] = useState<SessionState>("idle");
  const [className, setClassName] = useState<string | null>(null);
  const [liveTranscript, setLiveTranscript] = useState("");
  const latestTranscriptRef = useRef("");

  const [catchUpState, setCatchUpState] = useState<CatchUpState>("idle");
  const [catchUpError, setCatchUpError] = useState<string | null>(null);
  const [summary, setSummary] = useState<string | null>(null);
  const [topic, setTopic] = useState<string | null>(null);
  const [syncState, setSyncState] = useState<SyncState>("idle");
  const [pendingSignal, setPendingSignal] = useState<CatchUpSignal | null>(null);

  useEffect(() => {
    setStudentId(getOrCreateStudentId());
  }, []);

  useEffect(() => {
    if (!sessionCode) return;

    setSessionState("joining");
    latestTranscriptRef.current = "";
    setLiveTranscript("");
    let unsubscribed = false;

    const unsubscribe = onSnapshot(
      doc(db, "sessions", sessionCode),
      (snapshot) => {
        if (unsubscribed) return;
        if (!snapshot.exists()) {
          setSessionState("not-found");
          setClassName(null);
          latestTranscriptRef.current = "";
          setLiveTranscript("");
          return;
        }
        const data = snapshot.data() as { className?: string; liveTranscript?: string };
        const nextTranscript = typeof data.liveTranscript === "string" ? data.liveTranscript : "";
        setClassName(data.className ?? null);
        latestTranscriptRef.current = nextTranscript;
        setLiveTranscript(nextTranscript);
        setSessionState("joined");
      },
      () => {
        if (!unsubscribed) setSessionState("error");
      }
    );

    return () => {
      unsubscribed = true;
      unsubscribe();
    };
  }, [sessionCode]);

  function handleJoin(e: React.FormEvent) {
    e.preventDefault();
    const normalized = codeInput.trim().toUpperCase();
    if (!normalized) return;
    setSessionCode(normalized);
  }

  function handleChangeSession() {
    setSessionCode(null);
    setSessionState("idle");
    setClassName(null);
    latestTranscriptRef.current = "";
    setLiveTranscript("");
    setCatchUpState("idle");
    setCatchUpError(null);
    setSummary(null);
    setTopic(null);
    setSyncState("idle");
    setPendingSignal(null);
    setCodeInput("");
  }

  async function syncCatchUpSignal(signal: CatchUpSignal) {
    if (!sessionCode || !studentId) throw new Error("The session is not ready to sync.");

    const batch = writeBatch(db);
    const timestamp = serverTimestamp();
    batch.set(doc(db, "sessions", sessionCode, "pings", signal.id), {
      createdAt: timestamp,
      studentId,
      topic: signal.topic,
      summary: signal.summary,
    });
    batch.set(
      doc(db, "sessions", sessionCode, "students", studentId),
      {
        studentId,
        topic: signal.topic,
        summary: signal.summary,
        lastCatchUpAt: timestamp,
        catchUpCount: increment(1),
      },
      { merge: true }
    );
    await batch.commit();
  }

  async function retrySignalSync() {
    if (!pendingSignal || syncState === "syncing") return;
    setSyncState("syncing");
    try {
      await syncCatchUpSignal(pendingSignal);
      setPendingSignal(null);
      setSyncState("synced");
    } catch (err) {
      console.error("[catch-me-up] retry ping sync failed", err);
      setSyncState("error");
    }
  }

  async function handleCatchMeUp() {
    if (!sessionCode || !studentId || catchUpState === "loading") return;
    const transcriptSnippet = latestTranscriptRef.current.trim();
    setCatchUpError(null);
    setSummary(null);
    setTopic(null);
    setSyncState("idle");
    setPendingSignal(null);
    setCatchUpState("loading");

    // The "I'm stuck" signal should reach the teacher even if the AI summary
    // can't be generated right now, so the ping write is independent of the
    // Gemini call's success.
    let newSummary = "";
    let newTopic = "General";
    let aiFailed = false;
    let aiError = "";

    try {
      const res = await fetch("/api/catch-me-up", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcriptSnippet }),
      });
      const result = (await res.json().catch(() => ({}))) as {
        recap?: string;
        summary?: string;
        topic?: string;
        error?: string;
      };
      if (!res.ok) {
        aiFailed = true;
        aiError = result.error || "The AI recap service could not respond.";
      } else {
        newSummary = (result.summary || result.recap || "").trim();
        newTopic = result.topic?.trim() || "General";
        if (!newSummary) {
          aiFailed = true;
          aiError = "Anchor couldn't find enough clear lecture audio to create a recap yet.";
        }
      }
    } catch {
      aiFailed = true;
      aiError = "The AI recap service could not be reached.";
    }

    setSummary(newSummary);
    setTopic(newTopic);
    setCatchUpState(aiFailed ? "flagged" : "done");
    if (aiFailed) {
      setCatchUpError(`${aiError} Your teacher will still receive your anonymous help signal.`);
    }

    const signal = { id: crypto.randomUUID(), summary: newSummary, topic: newTopic };
    setPendingSignal(signal);
    setSyncState("syncing");
    try {
      await syncCatchUpSignal(signal);
      setPendingSignal(null);
      setSyncState("synced");
    } catch (err) {
      console.error("[catch-me-up] ping sync failed", err);
      setSyncState("error");
    }
  }

  const transcriptWordCount = liveTranscript.trim() ? liveTranscript.trim().split(/\s+/).length : 0;

  if (!sessionCode || sessionState === "not-found") {
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
          <p className="eyebrow mt-8">JOIN A SESSION</p>
          <h1 className="section-title mt-5 text-4xl">Lost track? Catch back up.</h1>
          <p className="mt-5 text-base leading-7 text-stone-400">
            Enter the code your teacher shared to join the live session.
          </p>

          <form onSubmit={handleJoin} className="mt-8 flex flex-col items-center gap-4">
            <input
              value={codeInput}
              onChange={(e) => setCodeInput(e.target.value)}
              placeholder="Session code (e.g. ABC123)"
              className="w-full rounded-full border border-white/10 bg-white/[0.03] px-5 py-3 text-center text-lg uppercase tracking-[0.15em] text-stone-200 placeholder:text-stone-600 placeholder:normal-case placeholder:tracking-normal focus:border-gold/60 focus:outline-none"
              maxLength={6}
            />
            <button type="submit" className="button button-primary w-full">
              Join Session
            </button>
          </form>

          {sessionState === "not-found" && (
            <div className="mt-6 rounded-2xl border border-red-500/30 bg-red-500/[0.06] px-5 py-3 text-sm text-red-300">
              We couldn&apos;t find a session with that code. Double check with your teacher.
            </div>
          )}

          <Link
            href="/student"
            className="mt-8 inline-flex items-center text-sm text-stone-400 transition-colors hover:text-gold hover:underline hover:underline-offset-4"
          >
            Not joining a live class? Record and study a lecture solo instead&nbsp;
            <span aria-hidden="true">→</span>
          </Link>
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

      <div className="section-shell relative z-10 flex min-h-screen max-w-2xl flex-col items-center pb-16 pt-10 text-center md:pt-14">
        <a href="/" className="font-serif text-xl tracking-[-0.04em] text-stone-50">
          Anchor<span className="text-gold">.</span>
        </a>

        <div className="mt-6 flex flex-col items-center gap-3">
          <p className="eyebrow">JOINED SESSION</p>
          <div className="flex flex-wrap items-center justify-center gap-4">
            <span className="font-serif text-4xl tracking-[-0.03em] text-stone-50 sm:text-5xl">
              {sessionCode}
            </span>
            <span className="status-pill">
              <span
                className="status-dot"
                style={sessionState !== "joined" ? { animation: "none", opacity: 0.4 } : undefined}
              />
              {sessionState === "joined" && "Live"}
              {sessionState === "joining" && "Connecting…"}
              {sessionState === "error" && "Connection error"}
            </span>
          </div>
          {className && <p className="text-sm leading-6 text-stone-400">{className}</p>}
          <button type="button" onClick={handleChangeSession} className="button button-secondary text-xs">
            Not your class? Change session
          </button>
        </div>

        {sessionState === "error" && (
          <div className="mt-8 w-full rounded-2xl border border-red-500/30 bg-red-500/[0.06] px-5 py-3 text-sm text-red-300">
            Couldn&apos;t reach the live session. This page will keep retrying automatically.
          </div>
        )}

        <section className="signal-card mt-12 w-full">
          <p className="text-xs font-semibold tracking-[0.22em] text-gold">FEELING LOST?</p>
          <h2 className="mt-3 font-serif text-2xl tracking-[-0.03em] text-stone-50">
            Get caught up on what you missed
          </h2>
          <p className="mt-3 text-sm leading-6 text-stone-400">
            Tap the button below and Anchor will summarize the last few minutes of class for you.
          </p>

          <div
            className={`mt-6 flex items-center justify-center gap-2 rounded-full border px-4 py-2 text-xs ${
              transcriptWordCount
                ? "border-emerald-400/20 bg-emerald-400/[0.06] text-emerald-300"
                : "border-white/10 bg-white/[0.03] text-stone-400"
            }`}
            aria-live="polite"
          >
            <span className={transcriptWordCount ? "status-dot" : "h-2 w-2 rounded-full bg-stone-600"} />
            {transcriptWordCount
              ? `Firebase transcript live · ${transcriptWordCount} words available`
              : "Waiting for your teacher to start sharing audio"}
          </div>

          <button
            type="button"
            onClick={handleCatchMeUp}
            disabled={catchUpState === "loading" || sessionState !== "joined"}
            className="button button-primary mt-8 w-full text-base disabled:opacity-60"
          >
            {catchUpState === "loading" ? "Catching you up…" : "Catch Me Up"}
          </button>

          {catchUpState === "flagged" && (
            <div role="alert" className="mt-6 rounded-2xl border border-red-500/30 bg-red-500/[0.06] px-5 py-3 text-sm text-red-300">
              <p>{catchUpError}</p>
              {syncState === "syncing" && <p className="mt-2 text-xs text-red-200">Notifying your teacher…</p>}
              {syncState === "synced" && <p className="mt-2 text-xs text-emerald-300">✓ Teacher dashboard updated live</p>}
              {syncState === "error" && (
                <button type="button" onClick={retrySignalSync} className="mt-2 font-semibold text-red-200 underline underline-offset-4">Retry teacher notification</button>
              )}
              <button type="button" onClick={handleCatchMeUp} className="mt-2 ml-3 font-semibold text-red-200 underline underline-offset-4">Try AI recap again</button>
            </div>
          )}

          {catchUpState === "done" && (
            <div className="mt-8 rounded-2xl border border-gold/25 bg-white/[0.04] px-7 py-7 text-left">
              <span className="status-pill text-sm">
                <span className="status-dot" />
                {topic}
              </span>
              <p className="mt-5 text-lg leading-8 text-stone-100">
                {summary || "Nothing notable came up in the last few minutes — you're not missing much."}
              </p>
              {syncState === "syncing" && (
                <p className="mt-4 text-xs text-stone-500" role="status">Updating your teacher&apos;s live dashboard…</p>
              )}
              {syncState === "synced" && (
                <p className="mt-4 text-xs text-emerald-300" role="status">✓ Teacher dashboard updated live</p>
              )}
              {syncState === "error" && (
                <div className="mt-4 rounded-xl border border-amber-400/25 bg-amber-400/[0.06] px-4 py-3 text-sm text-amber-200" role="alert">
                  <p>Your recap is ready, but the anonymous class signal did not sync.</p>
                  <button
                    type="button"
                    onClick={retrySignalSync}
                    className="mt-2 font-semibold underline underline-offset-4"
                  >
                    Retry dashboard sync
                  </button>
                </div>
              )}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
