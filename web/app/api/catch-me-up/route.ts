import { NextRequest, NextResponse } from "next/server";

const GEMINI_MODEL = "gemini-flash-latest";
const CATCH_ME_UP_PROMPT =
  "You are helping a student who just tuned back in to a live lecture catch up. " +
  "Read the following rolling transcript snippet of what the teacher has been saying, then respond with " +
  "a 30-60 word plain-language recap of what was just said (summary), and a short 2-4 word topic tag for " +
  "what's being discussed, in Title Case (topic). " +
  'If the transcript is empty or has no discernible content, respond with summary "" and topic "General".';

type CatchMeUpResult = { summary: string; topic: string };

function parseGeminiJson(raw: string): CatchMeUpResult {
  try {
    const parsed = JSON.parse(raw) as Partial<CatchMeUpResult>;
    return {
      summary: typeof parsed.summary === "string" ? parsed.summary : "",
      topic: typeof parsed.topic === "string" && parsed.topic.trim() ? parsed.topic : "General",
    };
  } catch {
    return { summary: "", topic: "General" };
  }
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "GEMINI_API_KEY is not configured" }, { status: 500 });
  }

  const body = (await req.json()) as { transcriptSnippet?: string; studentId?: string };
  const transcriptSnippet = body.transcriptSnippet;
  const studentId = body.studentId;

  if (typeof transcriptSnippet !== "string" || typeof studentId !== "string" || !studentId) {
    return NextResponse.json({ error: "Missing transcriptSnippet or studentId" }, { status: 400 });
  }

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
            parts: [{ text: `${CATCH_ME_UP_PROMPT}\n\nTranscript snippet:\n${transcriptSnippet}` }],
          },
        ],
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: {
            type: "OBJECT",
            properties: {
              summary: { type: "STRING" },
              topic: { type: "STRING" },
            },
            required: ["summary", "topic"],
          },
        },
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
  const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  const { summary, topic } = parseGeminiJson(rawText);

  return NextResponse.json({ summary, topic });
}
