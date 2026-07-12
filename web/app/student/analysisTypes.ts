export type LectureAnalysis = {
  transcript: { text: string; lines: Array<{ start: number; end: number; speaker: string; text: string }>; model: string };
  guide: {
    title: string; className: string; summary: string; keyTakeaways: string[];
    concepts: Array<{ name: string; explanation: string; evidence: string }>;
    vocabulary: Array<{ term: string; definition: string; evidence: string }>;
    homework: Array<{ task: string; deadline: string | null; evidence: string }>;
    actionItems: string[]; flashcards: Array<{ front: string; back: string }>;
    quiz: Array<{ question: string; answer: string; explanation: string }>;
    podcastScript: string;
    limitations: string[]; confidence: number;
  };
  models: { transcription: string; analysis: string };
};

export function timestamp(seconds: number) {
  const value = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
}
