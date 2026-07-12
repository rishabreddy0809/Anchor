import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 300;

const MODEL = process.env.GEMINI_ANALYSIS_MODEL || "gemini-3.5-flash";
const BASE = "https://generativelanguage.googleapis.com/v1beta/models";

const responseSchema = {
  type: "object", required: ["transcript","guide"],
  properties: {
    transcript: { type: "object", required: ["text","lines"], properties: { text:{type:"string"}, lines:{type:"array",items:{type:"object",required:["start","end","speaker","text"],properties:{start:{type:"number"},end:{type:"number"},speaker:{type:"string"},text:{type:"string"}}}} } },
    guide: { type: "object", required:["title","className","summary","keyTakeaways","concepts","vocabulary","homework","actionItems","flashcards","quiz","podcastScript","limitations","confidence"], properties: {
      title:{type:"string"},className:{type:"string"},summary:{type:"string"},keyTakeaways:{type:"array",items:{type:"string"}},
      concepts:{type:"array",items:{type:"object",required:["name","explanation","evidence"],properties:{name:{type:"string"},explanation:{type:"string"},evidence:{type:"string"}}}},
      vocabulary:{type:"array",items:{type:"object",required:["term","definition","evidence"],properties:{term:{type:"string"},definition:{type:"string"},evidence:{type:"string"}}}},
      homework:{type:"array",items:{type:"object",required:["task","deadline","evidence"],properties:{task:{type:"string"},deadline:{type:["string","null"]},evidence:{type:"string"}}}},
      actionItems:{type:"array",items:{type:"string"}},flashcards:{type:"array",items:{type:"object",required:["front","back"],properties:{front:{type:"string"},back:{type:"string"}}}},
      quiz:{type:"array",items:{type:"object",required:["question","answer","explanation"],properties:{question:{type:"string"},answer:{type:"string"},explanation:{type:"string"}}}},
      podcastScript:{type:"string"},limitations:{type:"array",items:{type:"string"}},confidence:{type:"integer",minimum:0,maximum:100}
    } }
  }
};

export async function POST(request: Request) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return NextResponse.json({ error:"Gemini analysis is not configured. Add GEMINI_API_KEY to web/.env.local and restart the server.",code:"missing_api_key" },{status:503});
  try {
    const form=await request.formData(),audio=form.get("audio");
    if(!(audio instanceof File)||!audio.size)return NextResponse.json({error:"A non-empty audio recording is required."},{status:400});
    if(audio.size>18*1024*1024)return NextResponse.json({error:"This recording is too large for inline analysis. Keep it under 18 MB or upload a shorter segment."},{status:413});
    const data=Buffer.from(await audio.arrayBuffer()).toString("base64"),mimeType=audio.type||"audio/webm";
    const prompt=`Analyze this lecture recording as an expert tutor. First create an accurate transcript segmented with timestamps in seconds and speaker labels when distinguishable. Then create a polished study guide.\n\nSTRICT ACCURACY RULES:\n- Use only facts explicitly present in the audio. Never add outside knowledge.\n- Never invent homework, deadlines, names, formulas, examples, or definitions.\n- Every concept, vocabulary term, and homework item needs a short exact evidence excerpt.\n- If a detail is unclear or absent, omit it and state the gap under limitations.\n- Quiz answers and flashcards must be answerable only from this recording.\n- Create a 2-4 minute podcastScript as a natural dialogue between Tutor and Student. It must teach only supported material, correct likely misunderstandings, and never add facts. Format every line as "Tutor: ..." or "Student: ...".\n- If there is no discernible speech, return empty arrays, an honest summary, and confidence 0.`;
    const response=await fetch(`${BASE}/${MODEL}:generateContent`,{method:"POST",headers:{"Content-Type":"application/json","x-goog-api-key":apiKey},body:JSON.stringify({contents:[{role:"user",parts:[{text:prompt},{inlineData:{mimeType,data}}]}],generationConfig:{responseMimeType:"application/json",responseJsonSchema:responseSchema,temperature:0.1}})});
    if(!response.ok)throw new Error(await geminiError(response,"Gemini audio analysis failed"));
    const body=await response.json() as {candidates?:Array<{content?:{parts?:Array<{text?:string}>}}>};
    const text=body.candidates?.[0]?.content?.parts?.map(part=>part.text||"").join("")||"";
    if(!text)throw new Error("Gemini returned no lecture analysis.");
    const result=JSON.parse(text) as {transcript:{text:string;lines:unknown[]};guide:unknown};
    return NextResponse.json({...result,transcript:{...result.transcript,model:MODEL},models:{transcription:MODEL,analysis:MODEL}});
  }catch(error){return NextResponse.json({error:error instanceof Error?error.message:"Lecture analysis failed."},{status:500})}
}

async function geminiError(response:Response,fallback:string){try{const body=await response.json() as {error?:{message?:string}};return body.error?.message||`${fallback} (${response.status})`}catch{return `${fallback} (${response.status})`}}
