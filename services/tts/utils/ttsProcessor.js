// services/tts/utils/ttsProcessor.js
// ============================================================
// 🔊 Gemini 2.5 Flash TTS Processor — permanent, R2-integrated version
// ============================================================

import {
  R2_BUCKETS,
  listKeys,
  getObjectAsText,
  uploadBuffer,
} from "#shared/r2-client.js";
import fs from "fs";
import os from "os";
import path from "path";
import pLimit from "p-limit";
import fetch from "node-fetch";
import ffmpeg from "fluent-ffmpeg";
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

const CONFIG = {
  maxCharactersPerChunk: 4800,
  maxConcurrent: 1,
  delayBetweenRequests: 4000,
  maxRetries: 3,
};

// ─────────────────────────────────────────────────────────────
//  R2 HELPER: GET TEXT CHUNK URLS
// ─────────────────────────────────────────────────────────────
/**
 * Returns all public URLs of text chunks associated with a session.
 * Looks in the R2 raw-text bucket under `${sessionId}/`.
 */
export async function getTextChunkUrls(sessionId) {
  const bucket = R2_BUCKETS.RAW_TEXT || "rawtext";
  const prefix = `${sessionId}/`;

  const keys = await listKeys(bucket, prefix);
  if (!keys || !keys.length) {
    error(`❌ No text chunks found in ${bucket} for ${sessionId}`);
    return [];
  }

  const baseUrl = process.env.R2_PUBLIC_BASE_URL_RAW_TEXT.replace(/\/$/, "");
  const urls = keys.map((k) => `${baseUrl}/${k}`);

  info(`🧩 Retrieved ${urls.length} text chunk URLs for ${sessionId}`);
  return urls;
}

// ─────────────────────────────────────────────────────────────
//  TEXT CLEANING AND CHUNKING
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
  const wait = Math.max(
    0,
    CONFIG.delayBetweenRequests - (now - lastRequestTime)
  );
  if (wait) await new Promise((r) => setTimeout(r, wait));
  lastRequestTime = Date.now();
  return fn();
}

// ─────────────────────────────────────────────────────────────
//  MAIN PROCESSOR
// ─────────────────────────────────────────────────────────────
export async function processTTS(
  sessionId,
  { voiceName = DEFAULT_VOICE_NAME } = {}
) {
  info({ sessionId }, "🎙 Starting TTS");

  const urls = await getTextChunkUrls(sessionId);
  if (!urls.length) throw new Error("No text chunks found");

  // Combine text content from R2 chunks
  let combined = "";
  for (const u of urls) {
    const res = await fetch(u);
    if (res.ok) combined += (await res.text()) + "\n\n";
  }

  const chunks = chunkText(cleanText(combined));
  info(
    { sessionId, chunks: chunks.length },
    `🧠 Split combined text into ${chunks.length} synthesis chunks`
  );

  const limit = pLimit(CONFIG.maxConcurrent);
  const outputs = [];

  for (let i = 0; i < chunks.length; i++) {
    const text = chunks[i];
    const filename = `${sessionId}-part-${i + 1}.pcm`;

    await limit(async () => {
      await rateLimited(async () => {
        const payload = {
          model: "gemini-2.5-flash-preview-tts",
          contents: [{ parts: [{ text }] }],
          generationConfig: {
            responseModalities: ["AUDIO"],
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: { voiceName },
              },
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
        const inline = json.candidates?.[0]?.content?.parts?.find(
          (p) => p.inline_data
        );

        if (!inline?.inline_data?.data)
          throw new Error("No audio returned from Gemini");

        const data = Buffer.from(inline.inline_data.data, "base64");
        const tmpPath = path.join(os.tmpdir(), filename);
        await fs.promises.writeFile(tmpPath, data);

        // Upload to R2 (optional but useful)
        await uploadBuffer(R2_BUCKETS.RAW, filename, data);

        outputs.push({ chunk: i + 1, path: tmpPath });
        info(`🔊 Generated audio chunk ${i + 1}/${chunks.length}`);
      });
    });
  }

  info({ sessionId, outputs: outputs.length }, "✅ All TTS chunks processed");
  return { ok: true, sessionId, produced: outputs.length, outputs };
       }
