// ============================================================
// 🎙️ TTS Processor — Hardened Production Version
// ============================================================
//
// ✅ Cleans & truncates text before Polly
// ✅ Retries transient failures (rate limits, throttling)
// ✅ Logs precise AWS error messages
// ✅ Uploads all successful chunks to R2
// ============================================================

import {
  PollyClient,
  SynthesizeSpeechCommand,
} from "@aws-sdk/client-polly";
import { info, error, warn } from "#logger.js";
import { putObject } from "#shared/r2-client.js";
import pLimit from "p-limit";

const REGION = process.env.AWS_REGION || "eu-west-2";
const VOICE_ID = process.env.POLLY_VOICE_ID || "Brian";
const CONCURRENCY = parseInt(process.env.TTS_CONCURRENCY || "2", 10);
const MAX_CHARS = 2950; // safe limit for Neural engine

const R2_BUCKET_CHUNKS = process.env.R2_BUCKET_CHUNKS || "podcast-chunks";
const R2_PUBLIC_BASE_URL_CHUNKS =
  process.env.R2_PUBLIC_BASE_URL_CHUNKS ||
  "https://pub-f5923355782641348fc97d1a8aa9cd71.r2.dev";
const R2_PUBLIC_BASE_URL_RAW_TEXT =
  process.env.R2_PUBLIC_BASE_URL_RAW_TEXT ||
  "https://pub-7a098297d4ef4011a01077c72929753c.r2.dev";

// ------------------------------------------------------------
// 🧠 Initialize Polly
// ------------------------------------------------------------
const polly = new PollyClient({
  region: REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

info({ region: REGION, voice: VOICE_ID, concurrency: CONCURRENCY }, "🧩 Polly configuration");

// ------------------------------------------------------------
// 🧹 Text Cleaner
// ------------------------------------------------------------
function cleanText(input) {
  return input
    .replace(/[^\x09\x0A\x0D\x20-\x7EÀ-ÿ]/g, "") // strip control chars
    .replace(/&/g, "and")
    .replace(/<|>/g, "")
    .replace(/\n{2,}/g, ". ")
    .trim()
    .slice(0, MAX_CHARS);
}

// ------------------------------------------------------------
// 🔁 Polly Request with Retry
// ------------------------------------------------------------
async function synthesizeTextWithRetry(text, retries = 3) {
  const command = new SynthesizeSpeechCommand({
    Text: text,
    OutputFormat: "mp3",
    VoiceId: VOICE_ID,
    Engine: "neural",
  });

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const result = await polly.send(command);
      const buffer = Buffer.from(await result.AudioStream.transformToByteArray());
      return buffer;
    } catch (err) {
      const msg = err?.message || err.toString();
      warn({ attempt, msg }, "⚠️ Polly synthesis failed");
      if (attempt === retries) throw err;
      await new Promise((r) => setTimeout(r, 1000 * attempt)); // backoff
    }
  }
}

// ------------------------------------------------------------
// 🎧 TTS Processor
// ------------------------------------------------------------
export async function ttsProcessor(sessionId, chunkList = []) {
  info({ sessionId }, "🎙 TTS Processor Start");

  if (!Array.isArray(chunkList) || chunkList.length === 0)
    throw new Error("No text chunks provided to ttsProcessor");

  const limit = pLimit(CONCURRENCY);
  const results = [];

  const tasks = chunkList.map((chunk, index) =>
    limit(async () => {
      const chunkNumber = index + 1;
      try {
        const textUrl =
          chunk.url ||
          `${R2_PUBLIC_BASE_URL_RAW_TEXT}/${sessionId}/chunk-${String(
            chunkNumber
          ).padStart(3, "0")}.txt`;

        const res = await fetch(textUrl);
        if (!res.ok)
          throw new Error(`Failed to fetch chunk ${chunkNumber}: ${res.status}`);

        const rawText = await res.text();
        const cleaned = cleanText(rawText);
        if (!cleaned) throw new Error(`Empty or invalid text in chunk ${chunkNumber}`);

        const audioBuffer = await synthesizeTextWithRetry(cleaned, 3);

        const key = `${sessionId}/audio-${String(chunkNumber).padStart(3, "0")}.mp3`;
        await putObject("chunks", key, audioBuffer, "audio/mpeg");

        const publicUrl = `${R2_PUBLIC_BASE_URL_CHUNKS}/${encodeURIComponent(key)}`;
        info(
          { sessionId, key, bytes: audioBuffer.length },
          `✅ TTS chunk ${chunkNumber} uploaded`
        );

        results.push({ success: true, index: chunkNumber, url: publicUrl });
      } catch (err) {
        error({ sessionId, chunk: chunkNumber, message: err.message }, "❌ TTS Chunk Failure");
        results.push({ success: false, index: chunkNumber, error: err.message });
      }
    })
  );

  await Promise.all(tasks);

  const success = results.filter((r) => r.success).length;
  const fail = results.filter((r) => !r.success).length;

  info({ sessionId, success, fail }, "🎧 TTS Summary");

  if (success === 0) throw new Error("No TTS chunks were produced or returned.");
  return results.filter((r) => r.success);
}

export default { ttsProcessor };
