import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 300;

const MODEL = process.env.OPENROUTER_ANALYSIS_MODEL || "google/gemini-2.5-flash";

const SCHEMA_INSTRUCTIONS = `Return ONLY a single JSON object (no markdown code fences, no commentary before or after) with exactly this shape:
{"transcript":{"text":string,"lines":[{"start":number,"end":number,"speaker":string,"text":string}]},"guide":{"title":string,"className":string,"summary":string,"keyTakeaways":string[],"concepts":[{"name":string,"explanation":string,"evidence":string}],"vocabulary":[{"term":string,"definition":string,"evidence":string}],"homework":[{"task":string,"deadline":string|null,"evidence":string}],"actionItems":string[],"flashcards":[{"front":string,"back":string}],"quiz":[{"question":string,"answer":string,"explanation":string}],"podcastScript":string,"limitations":string[],"confidence":number}}
All fields are required (use empty arrays/strings and confidence 0 if there is no discernible speech).`;

export async function POST(request: Request) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return NextResponse.json({ error:"Lecture analysis is not configured. Add OPENROUTER_API_KEY to web/.env.local and restart the server.",code:"missing_api_key" },{status:503});
  try {
    const form=await request.formData(),audio=form.get("audio");
    if(!(audio instanceof File)||!audio.size)return NextResponse.json({error:"A non-empty audio recording is required."},{status:400});
    if(audio.size>18*1024*1024)return NextResponse.json({error:"This recording is too large for inline analysis. Keep it under 18 MB or upload a shorter segment."},{status:413});
    const data=Buffer.from(await audio.arrayBuffer()).toString("base64");
    const mimeType=audio.type||"audio/webm";
    const format=mimeType.includes("mp3")?"mp3":mimeType.includes("wav")?"wav":"webm";
    const prompt=`Analyze this lecture recording as an expert tutor. First create an accurate transcript segmented with timestamps in seconds and speaker labels when distinguishable. Then create a polished study guide.\n\nSTRICT ACCURACY RULES:\n- Use only facts explicitly present in the audio. Never add outside knowledge.\n- Never invent homework, deadlines, names, formulas, examples, or definitions.\n- Every concept, vocabulary term, and homework item needs a short exact evidence excerpt.\n- If a detail is unclear or absent, omit it and state the gap under limitations.\n- Quiz answers and flashcards must be answerable only from this recording.\n- Create a 2-4 minute podcastScript as a natural dialogue between Tutor and Student. It must teach only supported material, correct likely misunderstandings, and never add facts. Format every line as "Tutor: ..." or "Student: ...".\n- If there is no discernible speech, return empty arrays, an honest summary, and confidence 0.\n\n${SCHEMA_INSTRUCTIONS}`;
    const response=await fetch("https://openrouter.ai/api/v1/chat/completions",{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${apiKey}`},body:JSON.stringify({model:MODEL,temperature:0.1,messages:[{role:"user",content:[{type:"text",text:prompt},{type:"input_audio",input_audio:{data,format}}]}]})});
    if(!response.ok)throw new Error(await openRouterError(response,"Lecture audio analysis failed"));
    const body=await response.json() as {choices?:Array<{message?:{content?:string}}>};
    const raw=(body.choices?.[0]?.message?.content||"").trim();
    if(!raw)throw new Error("No lecture analysis was returned.");
    const unfenced=raw.replace(/^```(?:json)?\s*/i,"").replace(/```\s*$/,"").trim();
    const result=JSON.parse(unfenced) as {transcript:{text:string;lines:unknown[]};guide:unknown};
    return NextResponse.json({...result,transcript:{...result.transcript,model:MODEL},models:{transcription:MODEL,analysis:MODEL}});
  }catch(error){return NextResponse.json({error:error instanceof Error?error.message:"Lecture analysis failed."},{status:500})}
}

async function openRouterError(response:Response,fallback:string){try{const body=await response.json() as {error?:{message?:string}};return body.error?.message||`${fallback} (${response.status})`}catch{return `${fallback} (${response.status})`}}
