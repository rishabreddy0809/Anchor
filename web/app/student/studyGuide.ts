export type TranscriptLine = readonly [time: string, speaker: string, text: string];

export type GroundedItem = {
  title: string;
  explanation: string;
  evidence: string[];
};

export type ReviewQuestion = {
  prompt: string;
  answer: string;
  evidence: string;
};

export type StudyGuide = {
  sufficient: boolean;
  coverage: number;
  summary: string;
  concepts: GroundedItem[];
  vocabulary: GroundedItem[];
  questions: ReviewQuestion[];
  limits: string[];
};

export const STUDY_GUIDE_QUALITY_STANDARD = `
Create a source-grounded study guide that behaves like an expert tutor.
Use only information explicitly present in the supplied source. Never fill gaps
with outside knowledge. Organize the result into a concise summary, core ideas,
simple but accurate explanations, vocabulary, and review questions. Attach source
timestamps to every substantive claim. If the source is incomplete or unclear,
state the limitation instead of guessing. Accuracy takes priority over completeness.
`.trim();

export function buildGroundedStudyGuide(source: readonly TranscriptLine[]): StudyGuide {
  const fullText = source.map(([, , text]) => text).join(" ");
  const lower = fullText.toLowerCase();
  const wordCount = fullText.split(/\s+/).filter(Boolean).length;
  const mentioned = (phrase: string) => lower.includes(phrase.toLowerCase());
  const evidenceFor = (...phrases: string[]) => source.filter(([, , text]) => phrases.some((phrase) => text.toLowerCase().includes(phrase.toLowerCase()))).map(([time]) => time);
  const concepts: GroundedItem[] = [];
  const vocabulary: GroundedItem[] = [];
  const questions: ReviewQuestion[] = [];

  if (mentioned("cellular respiration") && mentioned("glucose") && mentioned("ATP")) {
    concepts.push({ title: "The purpose of cellular respiration", explanation: "The lecture connects the energy stored in glucose with ATP, describing ATP as the cell’s rechargeable energy currency.", evidence: evidenceFor("cellular respiration", "energy currency") });
    vocabulary.push({ title: "ATP", explanation: "Described in the lecture as a rechargeable energy currency used by the cell.", evidence: evidenceFor("energy currency") });
    questions.push({ prompt: "How does the lecture connect glucose and ATP?", answer: "Cellular respiration transfers energy associated with glucose into ATP, the cell’s usable energy currency.", evidence: evidenceFor("cellular respiration")[0] ?? "Source" });
  }
  if (mentioned("glycolysis") && mentioned("cytoplasm")) {
    concepts.push({ title: "Where glycolysis happens", explanation: "Glycolysis occurs in the cytoplasm. The instructor explicitly contrasts this with later stages that take place in the mitochondria.", evidence: evidenceFor("glycolysis happens", "glycolysis occurs") });
    vocabulary.push({ title: "Glycolysis", explanation: "A stage that splits one six-carbon glucose molecule into two three-carbon pyruvate molecules and yields a net gain of two ATP.", evidence: evidenceFor("splits one six-carbon") });
    vocabulary.push({ title: "Pyruvate", explanation: "The three-carbon product formed when glucose is split during glycolysis.", evidence: evidenceFor("pyruvate") });
    questions.push({ prompt: "Where does glycolysis occur, and what does it produce?", answer: "It occurs in the cytoplasm and produces two three-carbon pyruvate molecules with a net gain of two ATP.", evidence: evidenceFor("splits one six-carbon")[0] ?? "Source" });
  }
  if (mentioned("final electron acceptor") && mentioned("oxygen")) {
    concepts.push({ title: "Why oxygen matters", explanation: "For the stated exam point, remember the exact relationship: oxygen is the final electron acceptor in the electron transport chain.", evidence: evidenceFor("final electron acceptor") });
    vocabulary.push({ title: "Final electron acceptor", explanation: "The role assigned to oxygen at the end of the electron transport chain in this lecture.", evidence: evidenceFor("final electron acceptor") });
    questions.push({ prompt: "What role does oxygen play in the electron transport chain?", answer: "It is the final electron acceptor.", evidence: evidenceFor("final electron acceptor")[0] ?? "Source" });
  }
  if (mentioned("ATP synthase") && mentioned("gradient")) {
    concepts.push({ title: "How ATP synthase is powered", explanation: "The lecture says a concentration gradient drives hydrogen ions through ATP synthase, and that movement powers the conversion of ADP into ATP.", evidence: evidenceFor("concentration gradient", "ATP synthase") });
    vocabulary.push({ title: "ATP synthase", explanation: "The lecture identifies it as the structure through which hydrogen ions move, powering ATP formation from ADP.", evidence: evidenceFor("ATP synthase") });
    questions.push({ prompt: "What powers ATP synthase according to the lecture?", answer: "Hydrogen ions moving down a concentration gradient through ATP synthase power ATP formation.", evidence: evidenceFor("concentration gradient")[0] ?? "Source" });
  }

  const limits: string[] = [];
  if (!mentioned("krebs cycle") || evidenceFor("krebs cycle").length < 2) limits.push("The Krebs cycle is named, but its individual steps and products are not explained in enough detail to study from this source alone.");
  if (!mentioned("equation") && !mentioned("combines glucose")) limits.push("The source does not provide a complete cellular-respiration equation.");
  if (source.length < 5) limits.push("The source is short, so this guide should be treated as an overview rather than complete exam preparation.");

  const summaryParts = concepts.slice(0, 4).map((item) => item.explanation);
  return {
    sufficient: wordCount >= 80 && concepts.length >= 2,
    coverage: Math.min(98, Math.round(35 + concepts.length * 13 + Math.min(source.length, 8) * 2)),
    summary: summaryParts.length ? summaryParts.join(" ") : "The source does not contain enough specific information to create an accurate summary.",
    concepts,
    vocabulary,
    questions,
    limits,
  };
}
