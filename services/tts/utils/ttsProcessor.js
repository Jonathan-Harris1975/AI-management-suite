
// /app/services/tts/utils/ttsProcessor.js
import { s3, R2_BUCKETS, uploadBuffer, listKeys, getObjectAsText } from "#shared/r2-client.js";
import fs from "fs";
import os from "os";
import path from "path";
import pLimit from "p-limit";
import fetch from "node-fetch";
import ffmpeg from "fluent-ffmpeg";
import { log } from "../../../utils/logger.js";
import { validateEnv } from "../../../utils/envChecker.js";

// ✅ Ensure required env vars exist
validateEnv(["GEMINI_API_KEY"]);

const API_KEY = process.env.GEMINI_API_KEY;
const TTS_API_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent";

const CONFIG = {
  maxCharactersPerChunk: 4800,
  maxConcurrent: 1,
  delayBetweenRequests: 4000,
  maxRetries: 3,
};

let lastRequestTime = 0;
async function rateLimited(fn) {
  const now = Date.now();
  const wait = Math.max(0, CONFIG.delayBetweenRequests - (now - lastRequestTime));
  if (wait) await new Promise((r) => setTimeout(r, wait));
  lastRequestTime = Date.now();
  return fn();
}

function cleanText(t) {
  return (t || "").replace(/\s+/g, " ").trim();
}

function chunkText(text, maxLen = CONFIG.maxCharactersPerChunk) {
  if (!text) return [];
  const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
  const chunks = [];
  let cur = "";
  for (const s of sentences) {
    if ((cur + s).length > maxLen) {
      if (cur) chunks.push(cur.trim());
      cur = s;
    } else {
      cur += (cur ? " " : "") + s;
    }
  }
  if (cur.trim()) chunks.push(cur.trim());
  log.info({ count: chunks.length }, "📝 Text split");
  return chunks;
}

async function convertPcmToMp3(pcmFile, mp3File) {
  return new Promise((resolve, reject) => {
    ffmpeg(pcmFile)
      .inputOptions(["-f s16le", "-ar 24000", "-ac 1"])
      .audioCodec("libmp3lame")
      .audioFrequency(24000)
      .audioChannels(1)
      .outputOptions(["-b:a 64k"])
      .on("end", () => resolve(true))
      .on("error", reject)
      .save(mp3File);
  });
}

async function synthesizeChunk(text, outMp3, idx) {
  const payload = {
    model: "gemini-2.5-flash-preview-tts",
    contents: [
      {
        parts: [{ text }],
      },
    ],
    generationConfig: {
      responseModalities: ["AUDIO"],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: { voiceName: "Charon" },
        },
      },
    },
  };

  const res = await rateLimited(() =>
    fetch(`${TTS_API_URL}?key=${API_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": API_KEY },
      body: JSON.stringify(payload),
    })
  );

  const textResp = await res.text();
  if (!res.ok) {
    log.error({ status: res.status, text: textResp }, "❌ TTS API error");
    throw new Error(`TTS HTTP ${res.status}`);
  }
  const data = JSON.parse(textResp);
  const inline = data?.candidates?.[0]?.content?.parts?.[0]?.inlineData;
  if (!inline?.data) throw new Error("No audio data in TTS response");
  const pcm = Buffer.from(inline.data, "base64");
  const tmpPcm = path.join(os.tmpdir(), `tts-${Date.now()}-${idx}.pcm`);
  fs.writeFileSync(tmpPcm, pcm);
  await convertPcmToMp3(tmpPcm, outMp3);
  try {
    fs.unlinkSync(tmpPcm);
  } catch {}
}

export async function processTTS(sessionId) {
  log.info({ sessionId }, "🎙 Starting TTS");
  if (typeof getTextChunkUrls !== "function") {
    throw new Error("getTextChunkUrls(sessionId) is not defined in this module's scope");
  }
  const urls = await getTextChunkUrls(sessionId);
  if (!urls.length) throw new Error("No text chunks found");

  let combined = "";
  for (const u of urls) {
    const res = await fetch(u);
    if (res.ok) combined += (await res.text()) + "\n\n";
  }
  const chunks = chunkText(cleanText(combined));
  const limit = pLimit(CONFIG.maxConcurrent);

  const outMp3s = [];
  await Promise.all(
    chunks.map((chunk, i) =>
      limit(async () => {
        const outMp3 = path.join(os.tmpdir(), `tts-chunk-${sessionId}-${i}.mp3`);
        await synthesizeChunk(chunk, outMp3, i);
        const buf = fs.readFileSync(outMp3);
        const key = `${sessionId}/chunk-${i}.mp3`;
        await uploadBuffer({ bucket: R2_BUCKETS.RAW, key, body: buf, contentType: "audio/mpeg" });
        outMp3s[i] = key;
      })
    )
  );

  const produced = outMp3s.filter(Boolean).length;
  log.info({ sessionId, produced }, "✅ TTS complete");
  return { produced, chunkKeys: outMp3s };
}
