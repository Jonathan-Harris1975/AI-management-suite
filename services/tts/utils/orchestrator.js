
// services/tts/utils/orchestrator.js
// Production TTS orchestrator: load text from R2, chunk, TTS via Gemini, ffmpeg merge

import fs from "fs";
import os from "os";
import path from "path";
import { spawnSync } from "child_process";
import { info, error } from "#logger.js";
import { R2_BUCKETS, getObjectAsText, uploadBuffer, uploadText } from "#shared/r2-client.js";
import { generateSpeech, DEFAULT_VOICE_NAME } from "../utils/gemini-tts.js";

function chunkText(txt, maxChars = 1800){
  const paras = txt.split(/\n\s*\n/);
  const chunks = [];
  let buf = "";
  for (const p of paras){
    if ((buf + "\n\n" + p).length > maxChars){
      if (buf) chunks.push(buf.trim());
      buf = p;
    } else {
      buf = buf ? (buf + "\n\n" + p) : p;
    }
  }
  if (buf) chunks.push(buf.trim());
  return chunks;
}

function pcmToMp3(pcmPath, mp3Path){
  const res = spawnSync("ffmpeg", ["-y","-f","s16le","-ar","24000","-ac","1","-i", pcmPath, "-codec:a","libmp3lame","-b:a","128k", mp3Path], { stdio: "inherit" });
  if (res.status !== 0) throw new Error("ffmpeg conversion failed");
}

function concatMp3(files, outPath){
  const listPath = path.join(os.tmpdir(), `concat-${Date.now()}.txt`);
  fs.writeFileSync(listPath, files.map(f => `file '${f}'`).join("\n"));
  const res = spawnSync("ffmpeg", ["-y","-f","concat","-safe","0","-i", listPath, "-c","copy", outPath], { stdio: "inherit" });
  if (res.status !== 0) throw new Error("ffmpeg concat failed");
}

export async function orchestrateTTS(sessionId, { voiceName = DEFAULT_VOICE_NAME } = {}){
  try {
    info({ sessionId }, "🔊 TTS orchestration start");

    const text = await getObjectAsText(R2_BUCKETS.RAW_TEXT, `${sessionId}.txt`);
    if (!text?.trim()) throw new Error("No script text found in R2");

    const chunks = chunkText(text);
    info({ sessionId, chunks: chunks.length }, "🧩 Script chunked");

    const pcmFiles = [];
    for (let i=0;i<chunks.length;i++){
      const pcm = await generateSpeech(chunks[i], { voiceName, filename: `${sessionId}-${i}.pcm` });
      pcmFiles.push(pcm);
    }

    const mp3Parts = [];
    for (const pcm of pcmFiles){
      const mp3 = path.join(os.tmpdir(), path.basename(pcm).replace(/\.pcm$/,".mp3"));
      pcmToMp3(pcm, mp3);
      mp3Parts.push(mp3);
    }

    const finalMp3 = path.join(os.tmpdir(), `${sessionId}.mp3`);
    concatMp3(mp3Parts, finalMp3);

    const buffer = fs.readFileSync(finalMp3);
    await uploadBuffer(R2_BUCKETS.PODCAST, `${sessionId}.mp3`, buffer, "audio/mpeg");
    info({ sessionId, bytes: buffer.length }, "✅ MP3 uploaded");

    // Very simple VTT (timestamp placeholders)
    const vtt = "WEBVTT\n\n00:00.000 --> 00:10.000\nPodcast episode\n";
    await uploadText(R2_BUCKETS.TRANSCRIPTS, `${sessionId}.vtt`, vtt, "text/vtt");

    return { ok: true, sessionId, file: `${sessionId}.mp3`, durationSec: 0 };
  } catch (err) {
    error({ sessionId, error: err.message }, "💥 TTS orchestration failed");
    throw err;
  }
}

export default orchestrateTTS;
