import { NextRequest, NextResponse } from "next/server";

const GEMINI_MODEL = "gemini-flash-latest";
const CATCH_ME_UP_PROMPT = `You are helping a student catch up with a live lecture.
Based only on the transcript excerpt below, write a short, plain-English recap in 3-5 sentences and a 2-4 word topic tag in Title Case.
Write the recap directly to the student (for example, "You're covering...").
Prioritize the current idea and the minimum context needed to follow what comes next.
Do not invent, infer, or add anything that is not explicitly present in the transcript.
Return JSON with exactly two string fields: "summary" and "topic".`;

type CatchMeUpResult = { summary: string; topic: string };

function parseGeminiJson(raw: string): CatchMeUpResult {
  try {
    const parsed = JSON.parse(raw) as Partial<CatchMeUpResult>;
    return {
      summary: typeof parsed.summary === "string" ? parsed.summary.trim() : "",
      topic: typeof parsed.topic === "string" && parsed.topic.trim() ? parsed.topic.trim() : "General",
    };
  } catch {
    return { summary: "", topic: "General" };
  }
}

export async function POST(request: NextRequest) {
  let transcriptSnippet = "";
  try {
    const body = (await request.json()) as { transcriptSnippet?: unknown; studentId?: unknown };
    if (typeof body.transcriptSnippet === "string") transcriptSnippet = body.transcriptSnippet.trim();
  } catch {
    return NextResponse.json({ error: "The recap request was not valid JSON." }, { status: 400 });
  }

  if (!transcriptSnippet) {
    return NextResponse.json(
      { error: "There is no lecture audio yet. Ask your teacher to start sharing audio, then try again." },
      { status: 400 }
    );
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Live recap generation is not configured. The teacher should check the Gemini API setup." },
      { status: 503 }
    );
  }

  try {
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
              role: "user",
              parts: [{ text: `${CATCH_ME_UP_PROMPT}\n\nTRANSCRIPT EXCERPT:\n${transcriptSnippet}` }],
            },
          ],
          generationConfig: {
            temperature: 0.2,
            maxOutputTokens: 320,
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
      const detail = await readGeminiError(response);
      return NextResponse.json(
        { error: `Anchor couldn't generate a recap right now. ${detail}` },
        { status: response.status >= 400 && response.status < 600 ? response.status : 502 }
      );
    }

    const data = (await response.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const rawText = data.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("").trim() ?? "";
    const { summary, topic } = parseGeminiJson(rawText);

    if (!summary) {
      return NextResponse.json(
        { error: "Anchor couldn't find enough clear lecture audio to create a recap. Try again in a moment." },
        { status: 422 }
      );
    }

    return NextResponse.json({ recap: summary, summary, topic });
  } catch {
    return NextResponse.json(
      { error: "Anchor couldn't reach the recap service. Check your connection and try again." },
      { status: 502 }
    );
  }
}

async function readGeminiError(response: Response) {
  try {
    const body = (await response.json()) as { error?: { message?: string } };
    return body.error?.message || "Please try again in a moment.";
  } catch {
    return "Please try again in a moment.";
  }
}
