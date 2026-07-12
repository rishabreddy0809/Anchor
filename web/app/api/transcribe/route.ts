import { NextRequest, NextResponse } from "next/server";

const GEMINI_MODEL = "gemini-2.0-flash";
const TRANSCRIBE_PROMPT =
  "Transcribe the following audio exactly as spoken. Return only the transcript text, with no additional commentary or formatting. If there is no discernible speech, return an empty string.";

export async function POST(req: NextRequest) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "GEMINI_API_KEY is not configured" }, { status: 500 });
  }

  const incomingForm = await req.formData();
  const audio = incomingForm.get("audio");
  if (!(audio instanceof Blob)) {
    return NextResponse.json({ error: "Missing audio file" }, { status: 400 });
  }

  const base64Audio = Buffer.from(await audio.arrayBuffer()).toString("base64");

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: TRANSCRIBE_PROMPT },
              { inline_data: { mime_type: "audio/webm", data: base64Audio } },
            ],
          },
        ],
      }),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    return NextResponse.json({ error: errorText }, { status: response.status });
  }

  const data = (await response.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  return NextResponse.json({ text });
}
