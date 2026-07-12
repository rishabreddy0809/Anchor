"use client";

import { useEffect, useRef, useState } from "react";
import {
  addDoc,
  collection,
  doc,
  onSnapshot,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "../../../lib/firebase";

const STUDENT_ID_KEY = "anchor-student-id";

type SessionState = "idle" | "joining" | "joined" | "not-found" | "error";
type CatchUpState = "idle" | "loading" | "done" | "error";

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

  const [catchUpState, setCatchUpState] = useState<CatchUpState>("idle");
  const [catchUpError, setCatchUpError] = useState<string | null>(null);
  const [summary, setSummary] = useState<string | null>(null);
  const [topic, setTopic] = useState<string | null>(null);

  const hasResolvedRef = useRef(false);

  useEffect(() => {
    setStudentId(getOrCreateStudentId());
  }, []);

  useEffect(() => {
    if (!sessionCode) return;

    hasResolvedRef.current = false;
    setSessionState("joining");
    let unsubscribed = false;

    const unsubscribe = onSnapshot(
      doc(db, "sessions", sessionCode),
      (snapshot) => {
        if (unsubscribed) return;
        if (!snapshot.exists()) {
          hasResolvedRef.current = true;
          setSessionState("not-found");
          return;
        }
        hasResolvedRef.current = true;
        const data = snapshot.data() as { className?: string; liveTranscript?: string };
        setClassName(data.className ?? null);
        setLiveTranscript(data.liveTranscript ?? "");
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
    setLiveTranscript("");
    setCatchUpState("idle");
    setCatchUpError(null);
    setSummary(null);
    setTopic(null);
    setCodeInput("");
  }

  async function handleCatchMeUp() {
    if (!sessionCode || !studentId || catchUpState === "loading") return;
    setCatchUpState("loading");
    setCatchUpError(null);

    try {
      const res = await fetch("/api/catch-me-up", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcriptSnippet: liveTranscript, studentId }),
      });

      if (!res.ok) {
        setCatchUpState("error");
        setCatchUpError("Couldn't reach the catch-up assistant. Please try again.");
        return;
      }

      const { summary: newSummary, topic: newTopic } = (await res.json()) as {
        summary?: string;
        topic?: string;
      };

      setSummary(newSummary ?? "");
      setTopic(newTopic ?? "General");
      setCatchUpState("done");

      await addDoc(collection(db, "sessions", sessionCode, "pings"), {
        createdAt: serverTimestamp(),
        studentId,
        topic: newTopic ?? "General",
        summary: newSummary ?? "",
      });
    } catch {
      setCatchUpState("error");
      setCatchUpError("Something went wrong getting you caught up. Please try again.");
    }
  }

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

          <button
            type="button"
            onClick={handleCatchMeUp}
            disabled={catchUpState === "loading" || sessionState !== "joined"}
            className="button button-primary mt-8 w-full text-base disabled:opacity-60"
          >
            {catchUpState === "loading" ? "Catching you up…" : "Catch Me Up"}
          </button>

          {catchUpError && (
            <div className="mt-6 rounded-2xl border border-red-500/30 bg-red-500/[0.06] px-5 py-3 text-sm text-red-300">
              {catchUpError}
            </div>
          )}

          {catchUpState === "done" && summary !== null && (
            <div className="mt-8 rounded-2xl border border-gold/25 bg-white/[0.03] px-6 py-5 text-left">
              <span className="status-pill">
                <span className="status-dot" />
                {topic}
              </span>
              <p className="mt-4 text-base leading-7 text-stone-200">
                {summary || "It's been quiet — no new material to catch up on yet."}
              </p>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
