"use client";

import { motion, useReducedMotion } from "framer-motion";
import { addDoc, collection, doc, onSnapshot, serverTimestamp } from "firebase/firestore";
import Link from "next/link";
import { useEffect, useState } from "react";
import { db } from "../../../lib/firebase";

type SessionState = "connecting" | "live" | "not-found" | "error";

export default function StudentSessionPage({ params }: { params: { code: string } }) {
  const code = decodeURIComponent(params.code).trim().toUpperCase();
  const reduceMotion = useReducedMotion();
  const [sessionState, setSessionState] = useState<SessionState>("connecting");
  const [className, setClassName] = useState("");
  const [liveTranscript, setLiveTranscript] = useState("");
  const [recap, setRecap] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [pingWarning, setPingWarning] = useState("");

  useEffect(() => {
    setSessionState("connecting");
    const unsubscribe = onSnapshot(
      doc(db, "sessions", code),
      (snapshot) => {
        if (!snapshot.exists()) {
          setSessionState("not-found");
          setClassName("");
          setLiveTranscript("");
          return;
        }
        const data = snapshot.data() as { className?: unknown; liveTranscript?: unknown };
        setClassName(typeof data.className === "string" && data.className.trim() ? data.className.trim() : "Live class");
        setLiveTranscript(typeof data.liveTranscript === "string" ? data.liveTranscript : "");
        setSessionState("live");
      },
      () => setSessionState("error")
    );
    return unsubscribe;
  }, [code]);

  async function catchMeUp() {
    if (loading) return;
    setError("");
    setPingWarning("");

    if (!liveTranscript.trim()) {
      setError("Your teacher hasn't started sharing audio yet. Stay on this page and try again in a moment.");
      return;
    }

    setLoading(true);
    try {
      const response = await fetch("/api/catch-me-up", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcriptSnippet: liveTranscript }),
      });
      const result = (await response.json()) as { recap?: string; error?: string };
      if (!response.ok || !result.recap) throw new Error(result.error || "Anchor couldn't create a recap.");

      setRecap(result.recap);
      try {
        await addDoc(collection(db, "sessions", code, "pings"), { createdAt: serverTimestamp() });
      } catch {
        setPingWarning("Your recap is ready, but the anonymous classroom signal couldn't sync.");
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Anchor couldn't create a recap. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  if (sessionState === "connecting") return <StatusScreen eyebrow="JOINING SESSION" title="Connecting to your class…" body="Anchor is checking the live session code." loading />;
  if (sessionState === "not-found") return <StatusScreen eyebrow="SESSION NOT FOUND" title="Check the code with your teacher." body={`We couldn't find a live session for ${code}. The code may have been typed incorrectly or the session may have ended.`} />;
  if (sessionState === "error") return <StatusScreen eyebrow="CONNECTION ERROR" title="We couldn't reach the session." body="Check your internet connection and refresh this page. Your teacher's session may still be live." />;

  return (
    <main className="relative min-h-screen overflow-hidden bg-ink">
      <div className="pointer-events-none absolute inset-0" style={{ background: "radial-gradient(circle at 50% 0%, rgba(224,169,74,0.12), transparent 48%)" }} />
      <div className="pointer-events-none absolute -left-24 top-1/3 h-72 w-72 rounded-full bg-gold/[0.04] blur-3xl" />
      <div className="section-shell relative z-10 flex min-h-screen max-w-4xl flex-col pb-20 pt-8 md:pt-12">
        <header className="flex items-center justify-between border-b border-white/[0.07] pb-5">
          <Link href="/" className="font-serif text-xl tracking-[-0.04em] text-stone-50">Anchor<span className="text-gold">.</span></Link>
          <span className="status-pill"><span className="status-dot" />Live</span>
        </header>

        <motion.section initial={reduceMotion ? false : { opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.55 }} className="flex flex-1 flex-col items-center pt-14 text-center md:pt-20">
          <p className="eyebrow">STUDENT SESSION · {code}</p>
          <h1 className="mt-5 max-w-3xl font-serif text-[clamp(2.8rem,8vw,5.8rem)] leading-[0.95] tracking-[-0.05em] text-stone-50">{className}</h1>
          <p className="mt-6 max-w-xl text-sm leading-7 text-stone-400 md:text-base">Lost the thread? Anchor will explain what your class is discussing right now using only the teacher's live lecture buffer.</p>

          <button type="button" onClick={catchMeUp} disabled={loading} className="button button-primary mt-9 min-h-16 min-w-64 px-8 text-base disabled:cursor-wait disabled:opacity-70">
            {loading ? <><span className="h-4 w-4 animate-spin rounded-full border-2 border-ink/25 border-t-ink" />Catching you up…</> : <>Catch Me Up <span aria-hidden="true">→</span></>}
          </button>
          <p className="mt-3 text-xs text-stone-600">Anonymous by design · only the time of your tap is shared</p>

          {error && <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} role="alert" className="mt-7 w-full max-w-xl rounded-2xl border border-red-500/30 bg-red-500/[0.06] px-5 py-4 text-sm leading-6 text-red-300">{error}<button type="button" onClick={catchMeUp} className="ml-2 underline underline-offset-4">Retry</button></motion.div>}

          {recap && <motion.article key={recap} initial={reduceMotion ? false : { opacity: 0, y: 20, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: 0.5 }} className="signal-card mt-10 w-full text-left">
            <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-semibold tracking-[0.22em] text-gold">YOUR LIVE RECAP</p><h2 className="mt-3 font-serif text-3xl tracking-[-0.03em] text-stone-50">Here's the thread.</h2></div><span className="status-pill">✦ Gemini</span></div>
            <p className="mt-8 text-lg leading-9 text-stone-300 md:text-xl md:leading-10">{recap}</p>
            <div className="mt-8 flex items-center justify-between border-t border-white/[0.08] pt-5"><span className="text-xs text-stone-600">Based only on the current lecture buffer</span><button type="button" onClick={catchMeUp} disabled={loading} className="text-sm font-medium text-gold hover:text-[#edbb61]">Refresh recap →</button></div>
          </motion.article>}
          {pingWarning && <p role="status" className="mt-4 text-xs text-amber-300">{pingWarning}</p>}
        </motion.section>
      </div>
    </main>
  );
}

function StatusScreen({ eyebrow, title, body, loading = false }: { eyebrow: string; title: string; body: string; loading?: boolean }) {
  return <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-ink"><div className="pointer-events-none absolute inset-0" style={{ background: "radial-gradient(circle at 50% 35%, rgba(224,169,74,0.1), transparent 52%)" }} /><div className="relative z-10 max-w-lg px-6 text-center"><Link href="/" className="font-serif text-xl text-stone-50">Anchor<span className="text-gold">.</span></Link>{loading && <div className="mx-auto mt-10 h-10 w-10 animate-spin rounded-full border-2 border-gold/20 border-t-gold" />}<p className="eyebrow mt-9">{eyebrow}</p><h1 className="mt-5 font-serif text-4xl tracking-[-0.04em] text-stone-50">{title}</h1><p className="mt-5 leading-7 text-stone-400">{body}</p>{!loading && <Link href="/" className="button button-secondary mt-8">Back to Anchor</Link>}</div></main>;
}
