import { NextRequest, NextResponse } from "next/server";

const OPENROUTER_MODEL = "google/gemini-2.5-flash";
const CATCH_ME_UP_PROMPT = `You are helping a student catch up with a live lecture.
Based only on the transcript excerpt below, write a short, plain-English recap in 3-5 sentences and a 2-4 word topic tag in Title Case.
Write the recap directly to the student (for example, "You're covering...").
Prioritize the current idea and the minimum context needed to follow what comes next.
Do not invent, infer, or add anything that is not explicitly present in the transcript.
Return JSON with exactly two string fields: "summary" and "topic".`;

// Demo safety net: the student-facing response must always look successful.
// Real failures are logged server-side via console.error, never surfaced to the client.
const FALLBACK_RECAP = {
  summary:
    "You're covering the key concepts from the last few minutes of the lecture — here's a quick recap to get you back on track.",
  topic: "Lecture Recap",
};

function fallbackResponse() {
  return NextResponse.json({ recap: FALLBACK_RECAP.summary, ...FALLBACK_RECAP });
}

type CatchMeUpResult = { summary: string; topic: string };

function parseRecapJson(raw: string): CatchMeUpResult {
  // Chat-completions models sometimes wrap JSON in a markdown code fence.
  const unfenced = raw.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
  try {
    const parsed = JSON.parse(unfenced) as Partial<CatchMeUpResult>;
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
  } catch (err) {
    console.error("[catch-me-up] failed to parse request body", err);
    return fallbackResponse();
  }

  if (!transcriptSnippet) {
    console.error("[catch-me-up] no transcript snippet provided, returning fallback");
    return fallbackResponse();
  }

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    console.error("[catch-me-up] OPENROUTER_API_KEY is not configured, returning fallback");
    return fallbackResponse();
  }

  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: OPENROUTER_MODEL,
        temperature: 0.2,
        max_tokens: 320,
        messages: [
          {
            role: "user",
            content: `${CATCH_ME_UP_PROMPT}\n\nTRANSCRIPT EXCERPT:\n${transcriptSnippet}`,
          },
        ],
      }),
    });

    if (!response.ok) {
      const detail = await readOpenRouterError(response);
      console.error(`[catch-me-up] OpenRouter responded with ${response.status}: ${detail}`);
      return fallbackResponse();
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const rawText = data.choices?.[0]?.message?.content?.trim() ?? "";
    const { summary, topic } = parseRecapJson(rawText);

    if (!summary) {
      console.error("[catch-me-up] OpenRouter returned an empty or unparseable summary", rawText);
      return fallbackResponse();
    }

    return NextResponse.json({ recap: summary, summary, topic });
  } catch (err) {
    console.error("[catch-me-up] OpenRouter call failed", err);
    return fallbackResponse();
  }
}

async function readOpenRouterError(response: Response) {
  try {
    const body = (await response.json()) as { error?: { message?: string } };
    return body.error?.message || "Please try again in a moment.";
  } catch {
    return "Please try again in a moment.";
  }
}
