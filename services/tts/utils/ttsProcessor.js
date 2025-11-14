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

const REGION = process.env.AWS_REGION || "eu-west-2";
const VOICE_ID = process.env.POLLY_VOICE_ID || "Brian";
const CONCURRENCY = parseInt(process.env.TTS_CONCURRENCY || "2", 10);
const MAX_CHARS = 2950; // safe limit for Neural engine

// Retry configuration
const MAX_CHUNK_RETRIES = parseInt(process.env.MAX_CHUNK_RETRIES || "3", 10);
const RETRY_DELAY_MS = parseInt(process.env.RETRY_DELAY_MS || "2000", 10);
const RETRY_BACKOFF_MULTIPLIER = parseFloat(process.env.RETRY_BACKOFF_MULTIPLIER || "2", 10);

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

info("🧩 Polly configuration", { 
  region: REGION, 
  voice: VOICE_ID, 
  concurrency: CONCURRENCY,
  maxChunkRetries: MAX_CHUNK_RETRIES 
});

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
      const isRetryable = isRetryableError(err);
      
      warn("⚠️ Polly synthesis failed", { 
        attempt, 
        msg, 
        isRetryable,
        errorCode: err?.name || err?.code 
      });
      
      if (attempt === retries) throw err;
      
      // Exponential backoff
      const delay = 1000 * Math.pow(2, attempt - 1);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
}

// ------------------------------------------------------------
// 🔍 Check if error is retryable
// ------------------------------------------------------------
function isRetryableError(err) {
  const retryableErrors = [
    'ThrottlingException',
    'TooManyRequestsException',
    'ServiceUnavailable',
    'RequestTimeout',
    'NetworkingError',
    'TimeoutError',
    'ECONNRESET',
    'ETIMEDOUT',
    'ENOTFOUND'
  ];
  
  const errorCode = err?.name || err?.code || '';
  const errorMessage = err?.message || '';
  
  return retryableErrors.some(retryable => 
    errorCode.includes(retryable) || errorMessage.includes(retryable)
  );
}

// ------------------------------------------------------------
// 🎯 Process Single Chunk with Full Retry Logic
// ------------------------------------------------------------
async function processChunkWithRetry(sessionId, chunk, chunkNumber, attempt = 1) {
  try {
    const textUrl =
      chunk.url ||
      `${R2_PUBLIC_BASE_URL_RAW_TEXT}/${sessionId}/chunk-${String(
        chunkNumber
      ).padStart(3, "0")}.txt`;

    // Fetch text content
    const res = await fetch(textUrl);
    if (!res.ok) {
      throw new Error(`Failed to fetch chunk ${chunkNumber}: ${res.status}`);
    }

    const rawText = await res.text();
    const cleaned = cleanText(rawText);
    
    if (!cleaned) {
      throw new Error(`Empty or invalid text in chunk ${chunkNumber}`);
    }

    // Synthesize speech with Polly
    const audioBuffer = await synthesizeTextWithRetry(cleaned, 3);

    // Upload to R2
    const key = `${sessionId}/audio-${String(chunkNumber).padStart(3, "0")}.mp3`;
    await putObject("chunks", key, audioBuffer, "audio/mpeg");

    const publicUrl = `${R2_PUBLIC_BASE_URL_CHUNKS}/${encodeURIComponent(key)}`;
    
    info(
      `✅ TTS chunk ${chunkNumber} uploaded${attempt > 1 ? ` (retry ${attempt})` : ''}`,
      { 
        sessionId, 
        key, 
        bytes: audioBuffer.length,
        attempt: attempt > 1 ? attempt : undefined
      }
    );

    return { 
      success: true, 
      index: chunkNumber, 
      url: publicUrl,
      attempts: attempt 
    };
    
  } catch (err) {
    const isRetryable = isRetryableError(err);
    
    warn(
      `⚠️ TTS chunk ${chunkNumber} failed (attempt ${attempt}/${MAX_CHUNK_RETRIES})`,
      { 
        sessionId, 
        chunk: chunkNumber, 
        attempt,
        message: err.message,
        isRetryable,
        errorCode: err?.name || err?.code
      }
    );

    // Retry if possible and error is retryable
    if (attempt < MAX_CHUNK_RETRIES && isRetryable) {
      const delay = RETRY_DELAY_MS * Math.pow(RETRY_BACKOFF_MULTIPLIER, attempt - 1);
      
      info(
        `🔄 Retrying chunk ${chunkNumber} after ${delay}ms`,
        { sessionId, chunk: chunkNumber, delayMs: delay }
      );
      
      await new Promise(resolve => setTimeout(resolve, delay));
      return processChunkWithRetry(sessionId, chunk, chunkNumber, attempt + 1);
    }

    // Final failure
    error(
      `❌ TTS chunk ${chunkNumber} permanently failed after ${attempt} attempts`,
      { 
        sessionId, 
        chunk: chunkNumber, 
        message: err.message,
        totalAttempts: attempt 
      }
    );
    
    return { 
      success: false, 
      index: chunkNumber, 
      error: err.message,
      attempts: attempt 
    };
  }
}

// ------------------------------------------------------------
// 🎧 TTS Processor
// ------------------------------------------------------------
export async function ttsProcessor(sessionId, chunkList = []) {
  info("🎙 TTS Processor Start", { sessionId, totalChunks: chunkList.length });

  if (!Array.isArray(chunkList) || chunkList.length === 0) {
    throw new Error("No text chunks provided to ttsProcessor");
  }

  const limit = pLimit(CONCURRENCY);
  const results = [];

  const tasks = chunkList.map((chunk, index) =>
    limit(async () => {
      const chunkNumber = index + 1;
      const result = await processChunkWithRetry(sessionId, chunk, chunkNumber);
      results.push(result);
      return result;
    })
  );

  await Promise.all(tasks);

  // Sort results by index to maintain order
  results.sort((a, b) => a.index - b.index);

  const successfulChunks = results.filter((r) => r.success);
  const failedChunks = results.filter((r) => !r.success);
  
  const totalAttempts = results.reduce((sum, r) => sum + (r.attempts || 1), 0);

  info("🎧 TTS Processing Complete", { 
      sessionId, 
      total: results.length,
      success: successfulChunks.length,
      failed: failedChunks.length,
      totalAttempts,
      failedIndices: failedChunks.map(f => f.index)
    });

  // Log detailed failure information
  if (failedChunks.length > 0) {
    warn(
      `⚠️ ${failedChunks.length} chunk(s) failed permanently`,
      { 
        sessionId,
        failures: failedChunks.map(f => ({
          index: f.index,
          error: f.error,
          attempts: f.attempts
        }))
      }
    );
  }

  if (successfulChunks.length === 0) {
    throw new Error("No TTS chunks were successfully produced. All chunks failed.");
  }

  // Return only successful chunks with their URLs
  return successfulChunks;
}

export { ttsProcessor };
export default ttsProcessor;
