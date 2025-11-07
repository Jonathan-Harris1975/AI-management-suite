// ============================================================
// 🔊 Gemini 2.5 Flash TTS Processor — hybrid R2-integrated version
// ============================================================

import {
  listKeys,
  getObjectAsText,
  uploadBuffer,
  R2_BUCKETS,
} from "#shared/r2-client.js";
import fs from "fs";
import os from "os";
import path from "path";
import pLimit from "p-limit";
import fetch from "node-fetch";
import { info, error } from "#logger.js";

// ─────────────────────────────────────────────────────────────
//  ENV VALIDATION
// ─────────────────────────────────────────────────────────────
function validateEnv(names) {
  for (const n of names) {
    if (!process.env[n]) throw new Error(`Missing required env: ${n}`);
  }
}

validateEnv(["GEMINI_API_KEY", "R2_PUBLIC_BASE_URL_RAW_TEXT"]);

const API_KEY = process.env.GEMINI_API_KEY;
const TTS_API_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent";
const DEFAULT_VOICE_NAME = process.env.GEMINI_TTS_VOICE || "Charon";

// Config — tuned for Gemini 2.5 Flash
const CONFIG = {
  maxCharactersPerChunk: 4800,
  maxConcurrent: 1,
  delayBetweenRequests: 4000,
  maxRetries: 3,
};

// ─────────────────────────────────────────────────────────────
//  R2 TEXT CHUNK FETCHING
// ─────────────────────────────────────────────────────────────
export async function getTextChunkUrls(sessionId) {
  const prefix = `${sessionId}/`;
  const keys = await listKeys("rawtext", prefix);

  if (!keys || !keys.length) {
    error({ sessionId }, `❌ No text chunks found in rawtext for ${sessionId}`);
    return [];
  }

  const baseUrl = process.env.R2_PUBLIC_BASE_URL_RAW_TEXT.replace(/\/$/, "");
  const urls = keys.map((k) => `${baseUrl}/${k}`);

  info({ sessionId, count: urls.length }, "🧩 Found text chunk URLs");
  return urls;
}

// ─────────────────────────────────────────────────────────────
//  TEXT CLEANING + CHUNKING
// ─────────────────────────────────────────────────────────────
function cleanText(text = "") {
  return text
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function chunkText(text) {
  const chunks = [];
  let current = "";
  for (const sentence of text.split(/(?<=[.!?])\s+/)) {
    if ((current + sentence).length > CONFIG.maxCharactersPerChunk) {
      chunks.push(current.trim());
      current = "";
    }
    current += sentence + " ";
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks;
}

// ─────────────────────────────────────────────────────────────
//  RATE LIMITER
// ─────────────────────────────────────────────────────────────
let lastRequestTime = 0;
async function rateLimited(fn) {
  const now = Date.now();
  const wait = Math.max(0, CONFIG.delayBetweenRequests - (now - lastRequestTime));
  if (wait) await new Promise((r) => setTimeout(r, wait));
  lastRequestTime = Date.now();
  return fn();
}

// ─────────────────────────────────────────────────────────────
//  MAIN PROCESSOR
// ─────────────────────────────────────────────────────────────
export async function ttsProcessor(sessionId, { voiceName = DEFAULT_VOICE_NAME } = {}) {
  info({ sessionId }, "🎙 Starting TTS synthesis");

  // Fetch all text chunks from rawtext bucket
  const urls = await getTextChunkUrls(sessionId);
  if (!urls.length) throw new Error(`No text chunks found for ${sessionId}`);

  // Combine all raw text from chunks
  let combined = "";
  for (const url of urls) {
    const res = await fetch(url);
    if (res.ok) combined += (await res.text()) + "\n";
  }

  const chunks = chunkText(cleanText(combined));
  info({ sessionId, totalChunks: chunks.length }, "🧠 Prepared TTS chunks");

  const limit = pLimit(CONFIG.maxConcurrent);
  const outputs = [];

  // Create tmp folder for PCM buffers
  const tmpDir = path.join(os.tmpdir(), `tts_${sessionId}`);
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });

  for (let i = 0; i < chunks.length; i++) {
    const text = chunks[i];
    const filename = `${sessionId}-part-${i + 1}.pcm`;
    const tmpPath = path.join(tmpDir, filename);

    await limit(async () => {
      await rateLimited(async () => {
        const payload = {
          model: "gemini-2.5-flash-preview-tts",
          contents: [{ parts: [{ text }] }],
          generationConfig: {
            responseModalities: ["AUDIO"],
            speechConfig: {
              voiceConfig: { prebuiltVoiceConfig: { voiceName } },
            },
          },
        };

        const res = await fetch(`${TTS_API_URL}?key=${API_KEY}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        if (!res.ok) {
          const msg = await res.text();
          throw new Error(`Gemini TTS error ${res.status}: ${msg.slice(0, 200)}`);
        }

        const json = await res.json();
        const inline = json.candidates?.[0]?.content?.parts?.find((p) => p.inline_data);

        if (!inline?.inline_data?.data)
          throw new Error(`No audio data returned for chunk ${i + 1}`);

        const data = Buffer.from(inline.inline_data.data, "base64");
        await fs.promises.writeFile(tmpPath, data);

        // Upload chunk to R2 raw bucket
        await uploadBuffer("raw", filename, data, "audio/pcm");

        info({ sessionId, part: i + 1 }, "🔊 TTS chunk uploaded to R2");
        outputs.push(tmpPath);
      });
    });
  }

  info({ sessionId, produced: outputs.length }, "✅ All TTS chunks synthesized");
  return { ok: true, sessionId, produced: outputs.length, outputs };
       }
