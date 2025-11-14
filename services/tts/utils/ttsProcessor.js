// ============================================================
// 🎙️ TTS Processor — Hardened Production Version with Retry Logic
// ============================================================
//
// ✅ Cleans & truncates text before Polly
// ✅ Retries transient failures (rate limits, throttling)
// ✅ Chunk-level retry with exponential backoff
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

// ------------------------------------------------------------
// ⚙️ Environment
// ------------------------------------------------------------
const REGION = process.env.AWS_REGION || "eu-west-2";
const VOICE_ID = process.env.TTS_VOICE || "Amy";
const CHUNKS_BUCKET = process.env.R2_BUCKET_CHUNKS;
const PUBLIC_CHUNKS_BASE = process.env.R2_PUBLIC_BASE_URL_CHUNKS;

const MAX_CHARS = 2500;
const CONCURRENCY = 3;

const MAX_CHUNK_RETRIES = 4;
const RETRY_DELAY_MS = 1200;
const RETRY_BACKOFF_MULTIPLIER = 2.1;

const polly = new PollyClient({ region: REGION });

// ------------------------------------------------------------
// 🧼 Clean raw text before Polly
// ------------------------------------------------------------
function cleanText(input) {
  return input
    .replace(/[^\x09\x0A\x0D\x20-\x7EÀ-ÿ]/g, "")      // strip control chars
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
      const buffer = Buffer.from(
        await result.AudioStream.transformToByteArray()
      );
      return buffer;
    } catch (err) {
      const msg = err?.message || err.toString();
      const isRetryable =
        msg.includes("Throttling") ||
        msg.includes("TooManyRequests") ||
        msg.includes("slow down") ||
        msg.includes("Rate exceeded");

      warn(`⚠️ Polly request failed (attempt ${attempt}/${retries})`, {
        message: msg,
        isRetryable,
      });

      if (attempt === retries || !isRetryable) throw err;

      await new Promise((resolve) =>
        setTimeout(resolve, RETRY_DELAY_MS * attempt)
      );
    }
  }
}

// ------------------------------------------------------------
// 🔁 Chunk-level retry
// ------------------------------------------------------------
async function processChunkWithRetry(sessionId, chunk, chunkNumber, attempt = 1) {
  try {
    const cleaned = cleanText(chunk.text);
    const audioBuffer = await synthesizeTextWithRetry(cleaned);

    const key = `${sessionId}/chunk-${String(chunkNumber).padStart(3, "0")}.mp3`;
    await putObject(CHUNKS_BUCKET, key, audioBuffer, "audio/mpeg");

    const url = `${PUBLIC_CHUNKS_BASE}/${encodeURIComponent(key)}`;

    info(
      `✅ TTS chunk ${chunkNumber} uploaded${attempt > 1 ? ` (retry ${attempt})` : ""}`,
      { sessionId, key, url, bytes: audioBuffer.length, attempt }
    );

    return {
      success: true,
      index: chunkNumber,
      url,
      attempts: attempt,
    };
  } catch (err) {
    const isRetryable =
      err?.message?.includes("Throttling") ||
      err?.message?.includes("TooManyRequests") ||
      err?.message?.includes("slow down") ||
      err?.message?.includes("Rate exceeded");

    warn(
      `⚠️ TTS chunk ${chunkNumber} failed (attempt ${attempt}/${MAX_CHUNK_RETRIES})`,
      {
        sessionId,
        message: err.message,
        isRetryable,
        attempt,
      }
    );

    if (attempt < MAX_CHUNK_RETRIES && isRetryable) {
      const delay = RETRY_DELAY_MS * Math.pow(RETRY_BACKOFF_MULTIPLIER, attempt - 1);

      info(
        `🔄 Retrying chunk ${chunkNumber} after ${delay}ms`,
        { sessionId, chunk: chunkNumber, delayMs: delay }
      );

      await new Promise((resolve) => setTimeout(resolve, delay));
      return processChunkWithRetry(sessionId, chunk, chunkNumber, attempt + 1);
    }

    error(
      `❌ TTS chunk ${chunkNumber} permanently failed after ${attempt} attempts`,
      {
        sessionId,
        chunk: chunkNumber,
        message: err.message,
        totalAttempts: attempt,
      }
    );

    return {
      success: false,
      index: chunkNumber,
      error: err.message,
      attempts: attempt,
    };
  }
}

// ------------------------------------------------------------
// 🎧 TTS Processor — Main Exported Function
// ------------------------------------------------------------
async function ttsProcessor(sessionId, chunkList = []) {
  info("🎙 TTS Processor Start", {
    sessionId,
    totalChunks: chunkList.length,
  });

  if (!Array.isArray(chunkList) || chunkList.length === 0) {
    throw new Error("No text chunks provided to ttsProcessor");
  }

  const limit = pLimit(CONCURRENCY);
  const results = [];

  const tasks = chunkList.map((chunk, index) =>
    limit(async () => {
      return processChunkWithRetry(sessionId, chunk, index + 1);
    })
  );

  const raw = await Promise.all(tasks);
  const successfulChunks = raw.filter((r) => r.success);
  const failedChunks = raw.filter((r) => !r.success);

  if (failedChunks.length > 0) {
    warn(
      `⚠️ ${failedChunks.length} chunk(s) failed permanently`,
      {
        sessionId,
        failures: failedChunks.map((f) => ({
          index: f.index,
          error: f.error,
          attempts: f.attempts,
        })),
      }
    );
  }

  if (successfulChunks.length === 0) {
    throw new Error(
      "No TTS chunks were successfully produced. All chunks failed."
    );
  }

  return successfulChunks;
}

// ------------------------------------------------------------
// 📦 Exports (clean, correct, no duplicates)
// ------------------------------------------------------------
export { ttsProcessor };
export default ttsProcessor;
