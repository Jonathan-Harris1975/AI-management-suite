// ============================================================
// 🎙️ TTS Processor — Production Ready
// ============================================================
// Features:
// • Environment variable configuration
// • Text cleaning & truncation
// • Chunk-level retry with exponential backoff
// • Detailed error logging
// • R2 upload for successful chunks
// ============================================================

import {
  PollyClient,
  SynthesizeSpeechCommand,
} from "@aws-sdk/client-polly";
import { info, error, warn,debug } from "#logger.js";
import { putObject } from "#shared/r2-client.js";
import pLimit from "p-limit";

// ------------------------------------------------------------
// ⚙️ Configuration
// ------------------------------------------------------------
const REGION = process.env.AWS_REGION;
const VOICE_ID = process.env.POLLY_VOICE_ID;
const CHUNKS_BUCKET = process.env.R2_BUCKET_CHUNKS;
const PUBLIC_CHUNKS_BASE = process.env.R2_PUBLIC_BASE_URL_CHUNKS;

const MAX_CHARS = Number(process.env.MAX_POLLY_NATURAL_CHUNK_CHARS) || 2500;
const CONCURRENCY = Number(process.env.TTS_CONCURRENCY) || 3;
const MAX_CHUNK_RETRIES = Number(process.env.MAX_CHUNK_RETRIES) || 4;
const RETRY_DELAY_MS = Number(process.env.RETRY_DELAY_MS) || 1200;
const RETRY_BACKOFF_MULTIPLIER = Number(process.env.RETRY_BACKOFF_MULTIPLIER) || 2.1;

const polly = new PollyClient({ region: REGION });

// ------------------------------------------------------------
// 🧼 Text Cleaning
// ------------------------------------------------------------
function cleanText(input) {
  return input
    .replace(/[^\x09\x0A\x0D\x20-\x7EÀ-ÿ]/g, "")
    .replace(/&/g, "and")
    .replace(/<|>/g, "")
    .replace(/\n{2,}/g, ". ")
    .trim()
    .slice(0, MAX_CHARS);
}

// ------------------------------------------------------------
// 🔁 Polly Synthesis with Retry
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
      const message = err?.message || err.toString();
      const isRetryable = 
        message.includes("Throttling") ||
        message.includes("TooManyRequests") ||
        message.includes("slow down") ||
        message.includes("Rate exceeded");

      warn(`Polly attempt ${attempt}/${retries} failed`, {
        error: message,
        retryable: isRetryable
      });

      if (attempt === retries || !isRetryable) throw err;

      await new Promise(resolve => 
        setTimeout(resolve, RETRY_DELAY_MS * attempt)
      );
    }
  }
}

// ------------------------------------------------------------
// 🔄 Chunk Processing with Exponential Backoff
// ------------------------------------------------------------
async function processChunkWithRetry(sessionId, chunk, chunkNumber, attempt = 1) {
  try {
    const cleaned = cleanText(chunk.text);
    const audioBuffer = await synthesizeTextWithRetry(cleaned);

    const key = `${sessionId}/chunk-${String(chunkNumber).padStart(3, "0")}.mp3`;
    await putObject(CHUNKS_BUCKET, key, audioBuffer, "audio/mpeg");

    const url = `${PUBLIC_CHUNKS_BASE}/${encodeURIComponent(key)}`;

    const logMessage = attempt > 1 
      ? `✅ Chunk ${chunkNumber} recovered (attempt ${attempt})`
      : `✅ Chunk ${chunkNumber} processed`;

    debug(logMessage, {
      sessionId,
      key,
      size: `${(audioBuffer.length / 1024).toFixed(1)}KB`
    });

    return {
      success: true,
      index: chunkNumber,
      url,
      attempts: attempt,
    };
  } catch (err) {
    const message = err?.message || err.toString();
    const isRetryable =
      message.includes("Throttling") ||
      message.includes("TooManyRequests") ||
      message.includes("slow down") ||
      message.includes("Rate exceeded");

    warn(`Chunk ${chunkNumber} failed (attempt ${attempt}/${MAX_CHUNK_RETRIES})`, {
      sessionId,
      error: message,
      retryable: isRetryable
    });

    if (attempt < MAX_CHUNK_RETRIES && isRetryable) {
      const delay = RETRY_DELAY_MS * Math.pow(RETRY_BACKOFF_MULTIPLIER, attempt - 1);
      
      debug(`Retrying chunk ${chunkNumber} in ${delay}ms`, {
        sessionId,
        nextAttempt: attempt + 1
      });

      await new Promise(resolve => setTimeout(resolve, delay));
      return processChunkWithRetry(sessionId, chunk, chunkNumber, attempt + 1);
    }

    error(`Chunk ${chunkNumber} permanently failed after ${attempt} attempts`, {
      sessionId,
      chunk: chunkNumber,
      finalError: message
    });

    return {
      success: false,
      index: chunkNumber,
      error: message,
      attempts: attempt,
    };
  }
}

// ------------------------------------------------------------
// 🎧 Main TTS Processor
// ------------------------------------------------------------
async function ttsProcessor(sessionId, chunkList = []) {
 info("🗣️ Starting TTS processing");
  
  debug("🗣️ Starting TTS processing", {
    sessionId,
    totalChunks: chunkList.length,
    concurrency: CONCURRENCY
  });

  if (!Array.isArray(chunkList) || chunkList.length === 0) {
    throw new Error("No text chunks provided to TTS processor");
  }

  const limit = pLimit(CONCURRENCY);
  
  const tasks = chunkList.map((chunk, index) =>
    limit(() => processChunkWithRetry(sessionId, chunk, index + 1))
  );

  const results = await Promise.all(tasks);

  const successful = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);

  // 📊 Concise Completion Summary
  const summary = {
    sessionId,
    total: chunkList.length,
    successful: successful.length,
    failed: failed.length,
    successRate: `${((successful.length / chunkList.length) * 100).toFixed(1)}%`
  };

  if (failed.length > 0) {
    warn(`TTS completed with ${failed.length} failures`, summary);
  } else {
   debug (`TTS completed successfully`, summary);}
  info("🗣️ TTS completed successfully", )

  if (successful.length === 0) {
    throw new Error("TTS processing failed - no chunks were successfully produced");
  }

  return successful;
}

export { ttsProcessor };
export default ttsProcessor;
