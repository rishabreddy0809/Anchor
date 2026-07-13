import { NextRequest, NextResponse } from "next/server";

const OPENROUTER_MODEL = "google/gemini-2.5-flash";
const TRANSCRIBE_PROMPT =
  "Transcribe the following audio exactly as spoken. Return only the transcript text, with no additional commentary or formatting. If there is no discernible speech, return an empty string.";

export async function POST(req: NextRequest) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "OPENROUTER_API_KEY is not configured" }, { status: 500 });
  }

  const incomingForm = await req.formData();
  const audio = incomingForm.get("audio");
  if (!(audio instanceof Blob)) {
    return NextResponse.json({ error: "Missing audio file" }, { status: 400 });
  }

  const base64Audio = Buffer.from(await audio.arrayBuffer()).toString("base64");

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: OPENROUTER_MODEL,
      temperature: 0,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: TRANSCRIBE_PROMPT },
            { type: "input_audio", input_audio: { data: base64Audio, format: "webm" } },
          ],
        },
      ],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    return NextResponse.json({ error: errorText }, { status: response.status });
  }

  const data = (await response.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const text = data.choices?.[0]?.message?.content?.trim() ?? "";
  return NextResponse.json({ text });
}
