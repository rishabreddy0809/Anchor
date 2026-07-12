"use client";

import { AnimatePresence, motion, useInView, useReducedMotion } from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";

const searchable = [
  { title: "Student lecture workspace", detail: "Record, transcribe, summarize, and study", href: "/student", tag: "Student" },
  { title: "Live listening", detail: "A private rolling lecture buffer", href: "#demo", tag: "Feature" },
  { title: "Posture guidance", detail: "Private, on-device attention cues", href: "#demo", tag: "Feature" },
  { title: "Teacher dashboard", detail: "Anonymous real-time confusion insights", href: "#teachers", tag: "Teacher" },
  { title: "How Anchor works", detail: "From lost to caught up in three steps", href: "#how-it-works", tag: "Guide" },
];

const questions = [
  ["Does my lecture audio leave my device?", "No. Anchor is designed around private, on-device processing. Lecture audio is not uploaded or shared."],
  ["Can I use Anchor with online classes?", "Yes. The Student workspace can securely capture a browser tab or meeting window after you grant permission."],
  ["What does Anchor create after class?", "A searchable transcript, concise summary, flashcards, practice questions, key concepts, and a podcast-style recap."],
  ["What information can teachers see?", "Teachers see anonymous classroom-level signals—not individual audio, transcripts, or private student notes."],
];

function Counter({ value, suffix = "" }: { value: number; suffix?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const visible = useInView(ref, { once: true, amount: 0.8 });
  const [current, setCurrent] = useState(0);
  const reduceMotion = useReducedMotion();
  useEffect(() => {
    if (!visible) return;
    if (reduceMotion) { setCurrent(value); return; }
    const started = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const progress = Math.min(1, (now - started) / 900);
      setCurrent(Math.round(value * (1 - Math.pow(1 - progress, 3))));
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [reduceMotion, value, visible]);
  return <span ref={ref}>{current}{suffix}</span>;
}

export default function PremiumExperience() {
  const [loading, setLoading] = useState(true);
  const [light, setLight] = useState(false);
  const [query, setQuery] = useState("");
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const [generating, setGenerating] = useState(false);
  const [typed, setTyped] = useState("");
  const [toast, setToast] = useState("");
  const reduceMotion = useReducedMotion();
  const recap = "Photosynthesis converts light energy into chemical energy, beginning in the chloroplast and producing glucose the cell can use later.";

  useEffect(() => {
    const preferred = localStorage.getItem("anchor-site-theme") === "light";
    setLight(preferred);
    document.documentElement.classList.toggle("site-light", preferred);
    const timer = window.setTimeout(() => setLoading(false), reduceMotion ? 80 : 650);
    return () => window.clearTimeout(timer);
  }, [reduceMotion]);

  useEffect(() => {
    if (!generating) return;
    setTyped("");
    let index = 0;
    const timer = window.setInterval(() => {
      index += reduceMotion ? recap.length : 2;
      setTyped(recap.slice(0, index));
      if (index >= recap.length) { window.clearInterval(timer); setGenerating(false); showToast("AI recap ready"); }
    }, reduceMotion ? 1 : 24);
    return () => window.clearInterval(timer);
  }, [generating, reduceMotion]);

  const results = useMemo(() => query.trim() ? searchable.filter((item) => `${item.title} ${item.detail} ${item.tag}`.toLowerCase().includes(query.toLowerCase())) : searchable.slice(0, 3), [query]);

  function toggleTheme() {
    const next = !light;
    setLight(next);
    document.documentElement.classList.toggle("site-light", next);
    localStorage.setItem("anchor-site-theme", next ? "light" : "dark");
    showToast(`${next ? "Light" : "Dark"} mode enabled`);
  }

  function showToast(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(""), 2400);
  }

  return (
    <>
      <AnimatePresence>{loading && <motion.div className="site-loader" initial={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.3 }} role="status" aria-label="Loading Anchor"><div className="loader-anchor">A<span>.</span></div><div className="loader-track"><i /></div></motion.div>}</AnimatePresence>
      <div className="floating-orb orb-one" aria-hidden="true" /><div className="floating-orb orb-two" aria-hidden="true" />
      <button className="theme-toggle" onClick={toggleTheme} aria-label={`Switch to ${light ? "dark" : "light"} mode`} title="Toggle theme">{light ? "☾" : "☀"}</button>

      <section className="premium-shell relative z-10" aria-labelledby="explore-title">
        <motion.div initial={{ opacity: 0, y: 22 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.25 }} className="search-experience glass-panel">
          <div className="search-intro"><p className="eyebrow">EXPLORE ANCHOR</p><h2 id="explore-title">Find exactly what you need.</h2><p>Search features, tools, and guides instantly.</p></div>
          <div className="search-area"><label className="instant-search"><span aria-hidden="true">⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search Anchor…" aria-label="Search Anchor features" /><kbd>⌘ K</kbd></label><div className="search-results" aria-live="polite">{results.map((item) => <a key={item.title} href={item.href} onClick={() => showToast(`Opening ${item.title}`)}><span><b>{item.title}</b><small>{item.detail}</small></span><em>{item.tag}</em><i>→</i></a>)}{!results.length && <p>No results. Try “student,” “teacher,” or “recap.”</p>}</div></div>
        </motion.div>

        <div className="metric-grid">
          {[[3, " min", "Rolling private buffer"], [100, "%", "On-device by design"], [0, "", "Audio files uploaded"], [7, " days", "Study streak tracking"]].map(([value, suffix, label], index) => <motion.article key={label as string} initial={{ opacity: 0, y: 18 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: index * 0.08 }} className="metric-card glass-panel"><strong><Counter value={value as number} suffix={suffix as string} /></strong><span>{label}</span><div><i style={{ width: `${index === 2 ? 4 : Math.min(100, (value as number))}%` }} /></div></motion.article>)}
        </div>

        <div className="ai-showcase glass-panel">
          <div><p className="eyebrow">AI IN ACTION</p><h2>From lecture to clarity.</h2><p>See how Anchor turns a complicated moment into a concise explanation.</p><button className="button button-primary" onClick={() => setGenerating(true)} disabled={generating}>{generating ? "Generating…" : "Generate sample recap"}<span>✦</span></button></div>
          <div className="ai-output" aria-live="polite"><div className="ai-output-head"><span>✦ Anchor AI</span><small>{generating ? "Thinking" : typed ? "Ready" : "Waiting"}</small></div>{generating && !typed ? <div className="skeleton-stack"><i /><i /><i /></div> : <p className={typed ? "typing-result" : "empty-ai"}>{typed || "Your clear, private recap will appear here."}{generating && <b className="typing-caret" />}</p>}</div>
        </div>
      </section>

      <section className="faq-shell relative z-10" id="faq"><motion.div initial={{ opacity: 0, y: 22 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}><p className="eyebrow">COMMON QUESTIONS</p><h2 className="section-title">Everything you need to know.</h2></motion.div><div className="faq-list">{questions.map(([question, answer], index) => { const open = openFaq === index; return <article className="faq-item glass-panel" key={question}><button onClick={() => setOpenFaq(open ? null : index)} aria-expanded={open}><span>{question}</span><i>{open ? "−" : "+"}</i></button><AnimatePresence initial={false}>{open && <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}><p>{answer}</p></motion.div>}</AnimatePresence></article>; })}</div></section>

      <AnimatePresence>{toast && <motion.div className="site-toast" initial={{ opacity: 0, y: 18, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 8 }} role="status"><span>✓</span>{toast}</motion.div>}</AnimatePresence>
    </>
  );
}
