"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useMemo, useState } from "react";
import { buildGroundedStudyGuide, type TranscriptLine } from "./studyGuide";
import "./tutor-guide.css";

export default function TutorStudyGuide({ source }: { source: readonly TranscriptLine[] }) {
  const guide = useMemo(() => buildGroundedStudyGuide(source), [source]);
  const [openAnswer, setOpenAnswer] = useState<number | null>(null);
  const [section, setSection] = useState<"guide" | "vocabulary" | "review">("guide");

  return <div className="tutor-guide">
    <header className="guide-hero">
      <div><span className="guide-kicker">✦ SOURCE-GROUNDED STUDY GUIDE</span><h2>Cellular Respiration &amp; ATP</h2><p>Prepared from {source.length} timestamped lecture moments. No outside information added.</p></div>
      <div className="coverage-ring" style={{ "--coverage": `${guide.coverage * 3.6}deg` } as React.CSSProperties}><strong>{guide.coverage}%</strong><small>source coverage</small></div>
    </header>
    <div className={`source-verdict ${guide.sufficient ? "good" : "limited"}`}><i>{guide.sufficient ? "✓" : "!"}</i><div><b>{guide.sufficient ? "Strong source coverage for an overview" : "Limited source material"}</b><p>{guide.sufficient ? "Every explanation below is supported by the supplied transcript." : "Anchor has only included claims it can support and has identified the missing material."}</p></div></div>
    <nav className="guide-tabs" aria-label="Study guide sections"><button className={section === "guide" ? "active" : ""} onClick={() => setSection("guide")}>Tutor guide</button><button className={section === "vocabulary" ? "active" : ""} onClick={() => setSection("vocabulary")}>Vocabulary <span>{guide.vocabulary.length}</span></button><button className={section === "review" ? "active" : ""} onClick={() => setSection("review")}>Check understanding <span>{guide.questions.length}</span></button></nav>
    <AnimatePresence mode="wait">
      {section === "guide" && <motion.div key="guide" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="guide-layout"><main><section className="guide-summary"><span>QUICK STUDY SUMMARY</span><p>{guide.summary}</p></section><h3>Core ideas, explained clearly</h3>{guide.concepts.map((item, index) => <article className="concept-card" key={item.title}><i>{String(index + 1).padStart(2, "0")}</i><div><h4>{item.title}</h4><p>{item.explanation}</p><div>{item.evidence.map((time) => <span key={time}>◷ {time}</span>)}</div></div></article>)}</main><aside><span>ACCURACY NOTES</span><h3>What this source doesn’t cover</h3>{guide.limits.length ? guide.limits.map((limit) => <p key={limit}>ⓘ {limit}</p>) : <p>✓ No major coverage gaps detected.</p>}<small>Anchor does not fill these gaps with assumptions. Add more lecture material to expand the guide safely.</small></aside></motion.div>}
      {section === "vocabulary" && <motion.div key="vocabulary" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="vocab-grid">{guide.vocabulary.map((item) => <article key={item.title}><span>KEY TERM</span><h3>{item.title}</h3><p>{item.explanation}</p><footer>{item.evidence.map((time) => <i key={time}>Source · {time}</i>)}</footer></article>)}</motion.div>}
      {section === "review" && <motion.div key="review" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="review-questions"><header><div><span>ACTIVE RECALL</span><h3>Check what you understand</h3></div><p>Answer from memory, then reveal the source-backed response.</p></header>{guide.questions.map((question, index) => <article key={question.prompt}><span>QUESTION {index + 1}</span><h4>{question.prompt}</h4><button onClick={() => setOpenAnswer(openAnswer === index ? null : index)} aria-expanded={openAnswer === index}>{openAnswer === index ? "Hide answer" : "Reveal answer"}</button><AnimatePresence>{openAnswer === index && <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}><p>{question.answer}</p><small>Supported at {question.evidence}</small></motion.div>}</AnimatePresence></article>)}</motion.div>}
    </AnimatePresence>
  </div>;
}
