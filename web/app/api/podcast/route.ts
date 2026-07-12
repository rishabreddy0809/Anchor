import { NextResponse } from "next/server";
export const runtime="nodejs";export const maxDuration=180;

export async function POST(request:Request){
 const apiKey=process.env.GEMINI_API_KEY;if(!apiKey)return NextResponse.json({error:"GEMINI_API_KEY is not configured."},{status:503});
 try{
  const {script}=await request.json() as {script?:string};if(!script?.trim())return NextResponse.json({error:"A podcast script is required."},{status:400});
  const response=await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-tts-preview:generateContent",{method:"POST",headers:{"Content-Type":"application/json","x-goog-api-key":apiKey},body:JSON.stringify({contents:[{parts:[{text:`Read this educational podcast naturally. Tutor is calm, clear, and encouraging. Student is curious and thoughtful. Do not add or change any factual content.\n\n${script.slice(0,14000)}`}]}],generationConfig:{responseModalities:["AUDIO"],speechConfig:{multiSpeakerVoiceConfig:{speakerVoiceConfigs:[{speaker:"Tutor",voiceConfig:{prebuiltVoiceConfig:{voiceName:"Kore"}}},{speaker:"Student",voiceConfig:{prebuiltVoiceConfig:{voiceName:"Puck"}}}]}}}})});
  if(!response.ok)throw new Error(await geminiError(response,"Podcast generation failed"));
  const body=await response.json() as {candidates?:Array<{content?:{parts?:Array<{inlineData?:{data?:string;mimeType?:string}}>} }>};const audio=body.candidates?.[0]?.content?.parts?.find(part=>part.inlineData?.data)?.inlineData;
  if(!audio?.data)throw new Error("Gemini returned no podcast audio.");const pcm=Buffer.from(audio.data,"base64"),wav=toWav(pcm,24000,1,16);return new Response(wav,{headers:{"Content-Type":"audio/wav","Content-Disposition":"inline; filename=anchor-recap.wav","Cache-Control":"no-store"}})
 }catch(error){return NextResponse.json({error:error instanceof Error?error.message:"Podcast generation failed."},{status:500})}
}
function toWav(pcm:Buffer,sampleRate:number,channels:number,bits:number){const header=Buffer.alloc(44),byteRate=sampleRate*channels*bits/8,blockAlign=channels*bits/8;header.write("RIFF",0);header.writeUInt32LE(36+pcm.length,4);header.write("WAVE",8);header.write("fmt ",12);header.writeUInt32LE(16,16);header.writeUInt16LE(1,20);header.writeUInt16LE(channels,22);header.writeUInt32LE(sampleRate,24);header.writeUInt32LE(byteRate,28);header.writeUInt16LE(blockAlign,32);header.writeUInt16LE(bits,34);header.write("data",36);header.writeUInt32LE(pcm.length,40);return Buffer.concat([header,pcm])}
async function geminiError(response:Response,fallback:string){try{const body=await response.json() as {error?:{message?:string}};return body.error?.message||`${fallback} (${response.status})`}catch{return `${fallback} (${response.status})`}}
