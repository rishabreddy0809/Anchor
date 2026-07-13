"use client";

import { useEffect, useState } from "react";
import type { LectureAnalysis } from "./analysisTypes";
import { timestamp } from "./analysisTypes";
import "./real-results.css";
import "./podcast-results.css";

type ResultView = "summary" | "transcript" | "study" | "flashcards" | "quiz" | "podcast";

export default function RealStudyResults({
  analysis,
  duration,
  download,
}: {
  analysis: LectureAnalysis;
  duration: number;
  download: () => void;
}) {
  const [view, setView] = useState<ResultView>("summary");
  const [podcastStatus, setPodcastStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [podcastUrl, setPodcastUrl] = useState("");
  const [podcastError, setPodcastError] = useState("");
  const guide = analysis.guide;

  useEffect(() => () => {
    if (podcastUrl) URL.revokeObjectURL(podcastUrl);
  }, [podcastUrl]);

  async function generatePodcast() {
    setPodcastStatus("loading");
    setPodcastError("");
    try {
      const response = await fetch("/api/podcast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ script: guide.podcastScript }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error || "Podcast generation failed.");
      }
      const blob = await response.blob();
      setPodcastUrl(URL.createObjectURL(blob));
      setPodcastStatus("ready");
    } catch (error) {
      setPodcastError(error instanceof Error ? error.message : "Podcast generation failed.");
      setPodcastStatus("error");
    }
  }

  const tabs: Array<{ id: ResultView; label: string }> = [
    { id: "summary", label: "Summary" },
    { id: "transcript", label: "Transcript" },
    { id: "study", label: "Study guide" },
    { id: "flashcards", label: `Flashcards (${guide.flashcards.length})` },
    { id: "quiz", label: `Quiz (${guide.quiz.length})` },
    { id: "podcast", label: "Podcast" },
  ];

  return (
    <div className="real-results">
      <section className="result-heading">
        <div>
          <span>✦ REAL LECTURE ANALYSIS</span>
          <h1>{guide.title || "Analyzed lecture"}</h1>
          <p>
            {guide.className || "Unsorted class"} · {timestamp(duration)} · Grounded in {analysis.transcript.lines.length || 1} source segment(s)
          </p>
        </div>
        <div className="result-confidence">
          <b>{guide.confidence}%</b>
          <small>AI confidence</small>
        </div>
      </section>

      <nav aria-label="Lecture study sections">
        {tabs.map((tab) => (
          <button
            type="button"
            key={tab.id}
            className={view === tab.id ? "active" : ""}
            onClick={() => setView(tab.id)}
          >
            {tab.label}
          </button>
        ))}
        <button type="button" onClick={download}>⇩ Recording</button>
      </nav>

      {view === "summary" && (
        <div className="result-grid">
          <article>
            <span>FINAL AI SUMMARY</span>
            <h2>What the lecture covered</h2>
            <p>{guide.summary}</p>
            <h3>Key takeaways</h3>
            <ul>{guide.keyTakeaways.map((item) => <li key={item}>{item}</li>)}</ul>
          </article>
          <aside>
            <span>HOMEWORK &amp; ACTIONS</span>
            <h2>{guide.homework.length ? `${guide.homework.length} detected item${guide.homework.length === 1 ? "" : "s"}` : "No homework detected"}</h2>
            {guide.homework.map((item) => (
              <div className="real-homework" key={item.task}>
                <b>{item.task}</b>
                <small>{item.deadline || "No deadline stated"}</small>
                <em>Evidence: “{item.evidence}”</em>
              </div>
            ))}
            {!guide.homework.length && <p>The transcript did not explicitly state an assignment. Anchor did not invent one.</p>}
            <h3>Accuracy limits</h3>
            {guide.limitations.map((item) => <p className="limit" key={item}>ⓘ {item}</p>)}
          </aside>
        </div>
      )}

      {view === "transcript" && (
        <section className="real-transcript">
          {analysis.transcript.lines.length ? analysis.transcript.lines.map((line, index) => (
            <article key={`${line.start}-${index}`}>
              <time>{timestamp(line.start)}</time>
              <div><b>{line.speaker}</b><p>{line.text}</p></div>
            </article>
          )) : <p>{analysis.transcript.text}</p>}
        </section>
      )}

      {view === "study" && (
        <div className="study-results">
          <section>
            <span>KEY CONCEPTS</span>
            {guide.concepts.map((item) => (
              <article key={item.name}>
                <h3>{item.name}</h3>
                <p>{item.explanation}</p>
                <small>Evidence: “{item.evidence}”</small>
              </article>
            ))}
          </section>
          <section>
            <span>VOCABULARY</span>
            {guide.vocabulary.map((item) => (
              <article key={item.term}>
                <h3>{item.term}</h3>
                <p>{item.definition}</p>
                <small>Evidence: “{item.evidence}”</small>
              </article>
            ))}
          </section>
        </div>
      )}

      {view === "flashcards" && (
        <div className="study-results" style={{ gridTemplateColumns: "1fr" }}>
          <section>
            <span>FLASHCARDS</span>
            <h2>{guide.flashcards.length ? `${guide.flashcards.length} cards from this recording` : "No flashcards generated"}</h2>
            {guide.flashcards.map((item, index) => (
              <article key={`${item.front}-${index}`}>
                <small>CARD {index + 1}</small>
                <h3>{item.front}</h3>
                <p>{item.back}</p>
              </article>
            ))}
            {!guide.flashcards.length && <p>The recording did not contain enough clear material for flashcards.</p>}
          </section>
        </div>
      )}

      {view === "quiz" && (
        <div className="study-results" style={{ gridTemplateColumns: "1fr" }}>
          <section>
            <span>PRACTICE QUIZ</span>
            <h2>{guide.quiz.length ? `${guide.quiz.length} source-backed questions` : "No quiz generated"}</h2>
            {guide.quiz.map((item, index) => (
              <article key={`${item.question}-${index}`}>
                <small>QUESTION {index + 1}</small>
                <h3>{item.question}</h3>
                <details>
                  <summary>Reveal answer</summary>
                  <p>{item.answer}</p>
                  <small>{item.explanation}</small>
                </details>
              </article>
            ))}
            {!guide.quiz.length && <p>The recording did not contain enough clear material for a reliable quiz.</p>}
          </section>
        </div>
      )}

      {view === "podcast" && (
        <section className="generated-podcast">
          <span>GEMINI PODCAST RECAP</span>
          <h2>Listen to your lecture as a conversation</h2>
          <p>{guide.podcastScript}</p>
          {podcastStatus !== "ready" && (
            <button type="button" onClick={() => void generatePodcast()} disabled={podcastStatus === "loading"}>
              {podcastStatus === "loading" ? "Generating voices…" : "✦ Generate podcast audio"}
            </button>
          )}
          {podcastStatus === "ready" && (
            <div>
              <audio src={podcastUrl} controls preload="metadata" />
              <a href={podcastUrl} download="anchor-podcast-recap.wav">⇩ Download episode</a>
            </div>
          )}
          {podcastError && <small className="podcast-error">{podcastError}</small>}
        </section>
      )}

      <footer>Analyzed with {analysis.models.analysis} · Verify important details against the recording</footer>
    </div>
  );
}
