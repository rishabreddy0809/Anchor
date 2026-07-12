import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 300;

const OPENAI_URL = "https://api.openai.com/v1";

export async function POST(request: Request) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "AI analysis is not configured. Add OPENAI_API_KEY to web/.env.local and restart the server.", code: "missing_api_key" }, { status: 503 });

  try {
    const incoming = await request.formData();
    const audio = incoming.get("audio");
    if (!(audio instanceof File) || audio.size === 0) return NextResponse.json({ error: "A non-empty audio recording is required." }, { status: 400 });
    if (audio.size > 25 * 1024 * 1024) return NextResponse.json({ error: "This recording is over 25 MB. Record a shorter segment or compress the audio before analysis." }, { status: 413 });

    const transcript = await transcribe(audio, apiKey);
    if (!transcript.text.trim()) return NextResponse.json({ error: "No speech was detected in this recording." }, { status: 422 });
    const guide = await createStudyGuide(transcript.text, apiKey);

    return NextResponse.json({ transcript, guide, models: { transcription: transcript.model, analysis: process.env.OPENAI_STUDY_MODEL || "gpt-5.4-mini" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Lecture analysis failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

async function transcribe(audio: File, apiKey: string) {
  const diarized = new FormData();
  diarized.append("file", audio, audio.name || "lecture.webm");
  diarized.append("model", "gpt-4o-transcribe-diarize");
  diarized.append("response_format", "diarized_json");
  diarized.append("chunking_strategy", "auto");

  let response = await fetch(`${OPENAI_URL}/audio/transcriptions`, { method: "POST", headers: { Authorization: `Bearer ${apiKey}` }, body: diarized });
  if (response.ok) {
    const result = await response.json() as { text?: string; segments?: Array<{ start?: number; end?: number; speaker?: string; text?: string }> };
    return { text: result.text ?? result.segments?.map((segment) => segment.text).join(" ") ?? "", lines: (result.segments ?? []).map((segment) => ({ start: segment.start ?? 0, end: segment.end ?? 0, speaker: segment.speaker || "Speaker", text: segment.text?.trim() || "" })).filter((line) => line.text), model: "gpt-4o-transcribe-diarize" };
  }

  const standard = new FormData();
  standard.append("file", audio, audio.name || "lecture.webm");
  standard.append("model", "gpt-4o-transcribe");
  standard.append("response_format", "json");
  response = await fetch(`${OPENAI_URL}/audio/transcriptions`, { method: "POST", headers: { Authorization: `Bearer ${apiKey}` }, body: standard });
  if (!response.ok) throw new Error(await openAIError(response, "Transcription failed"));
  const result = await response.json() as { text?: string };
  return { text: result.text ?? "", lines: result.text ? [{ start: 0, end: 0, speaker: "Lecture", text: result.text.trim() }] : [], model: "gpt-4o-transcribe" };
}

async function createStudyGuide(transcript: string, apiKey: string) {
  const schema = {
    type: "object", additionalProperties: false,
    required: ["title","className","summary","keyTakeaways","concepts","vocabulary","homework","actionItems","flashcards","quiz","limitations","confidence"],
    properties: {
      title: { type: "string" }, className: { type: "string" }, summary: { type: "string" },
      keyTakeaways: { type: "array", items: { type: "string" } },
      concepts: { type: "array", items: { type: "object", additionalProperties: false, required: ["name","explanation","evidence"], properties: { name:{type:"string"}, explanation:{type:"string"}, evidence:{type:"string"} } } },
      vocabulary: { type: "array", items: { type: "object", additionalProperties: false, required: ["term","definition","evidence"], properties: { term:{type:"string"}, definition:{type:"string"}, evidence:{type:"string"} } } },
      homework: { type: "array", items: { type: "object", additionalProperties: false, required: ["task","deadline","evidence"], properties: { task:{type:"string"}, deadline:{type:["string","null"]}, evidence:{type:"string"} } } },
      actionItems: { type: "array", items: { type: "string" } },
      flashcards: { type: "array", items: { type: "object", additionalProperties: false, required: ["front","back"], properties: { front:{type:"string"}, back:{type:"string"} } } },
      quiz: { type: "array", items: { type: "object", additionalProperties: false, required: ["question","answer","explanation"], properties: { question:{type:"string"}, answer:{type:"string"}, explanation:{type:"string"} } } },
      limitations: { type: "array", items: { type: "string" } }, confidence: { type: "integer", minimum: 0, maximum: 100 }
    }
  };
  const response = await fetch(`${OPENAI_URL}/responses`, { method: "POST", headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" }, body: JSON.stringify({ model: process.env.OPENAI_STUDY_MODEL || "gpt-5.4-mini", reasoning: { effort: "low" }, input: [{ role: "system", content: [{ type: "input_text", text: "You are Anchor, an expert tutor. Use only facts explicitly present in the transcript. Never add outside knowledge, inferred deadlines, names, formulas, or assignments. If evidence is missing, omit the item and describe the gap in limitations. Make explanations clear and useful without sacrificing accuracy. Evidence fields must contain a short exact excerpt from the transcript." }] }, { role: "user", content: [{ type: "input_text", text: `Create a polished study guide from this lecture transcript:\n\n${transcript}` }] }], text: { format: { type: "json_schema", name: "grounded_study_guide", strict: true, schema } } }) });
  if (!response.ok) throw new Error(await openAIError(response, "Study-guide generation failed"));
  const result = await response.json() as { output?: Array<{ content?: Array<{ type?: string; text?: string }> }> };
  const output = result.output?.flatMap((item) => item.content ?? []).find((item) => item.type === "output_text")?.text;
  if (!output) throw new Error("The analysis model returned no study guide.");
  return JSON.parse(output) as unknown;
}

async function openAIError(response: Response, fallback: string) {
  try { const body = await response.json() as { error?: { message?: string } }; return body.error?.message || `${fallback} (${response.status})`; }
  catch { return `${fallback} (${response.status})`; }
}
