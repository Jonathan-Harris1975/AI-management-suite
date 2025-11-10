// services/tts/utils/ttsProcessor.js
// ============================================================
// 🎙 TTS Processor — Amazon Polly (URL-based chunk ingestion)
// ============================================================
//
// ✅ Features
//  • Reads text chunks directly from R2 public URLs
//  • Uses Amazon Polly neural voice (UK Brian by default)
//  • Detailed logging (fetch, Polly, error stack, summary)
//  • Safe heartbeat loop
// ============================================================

import { PollyClient, SynthesizeSpeechCommand } from "@aws-sdk/client-polly";
import { info, error, warn, debug } from "#logger.js";
import { startHeartbeat, stopHeartbeat } from "../../shared/utils/heartbeat.js";

// ------------------------------------------------------------
// 🔧 Configuration
// ------------------------------------------------------------
const VOICE_ID = process.env.POLLY_VOICE_ID || "Brian";
const REGION = process.env.AWS_REGION || "eu-west-2";
const TTS_CONCURRENCY = Number(process.env.TTS_CONCURRENCY || 2);

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

// ------------------------------------------------------------
// 🎧 Helper to fetch text from R2 public URL
// ------------------------------------------------------------
async function fetchChunkText(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText} when fetching ${url}`);
  return await res.text();
}

// ------------------------------------------------------------
// 🔊 Process a single chunk with Polly
// ------------------------------------------------------------
async function processChunk({ sessionId, index, url }) {
  const logContext = { sessionId, index, url };
  try {
    info(logContext, `🔍 Fetching chunk text from URL...`);
    const res = await fetch(url);

    if (!res.ok) {
      throw new Error(`HTTP ${res.status} ${res.statusText} when fetching ${url}`);
    }

    const text = await res.text();
    if (!text || !text.trim()) {
      throw new Error(`Empty text content returned from ${url}`);
    }

    debug({ ...logContext, length: text.length }, `📜 Chunk text fetched successfully`);

    const synthCmd = new SynthesizeSpeechCommand({
      OutputFormat: "mp3",
      Engine: "neural",
      Text: text,
      VoiceId: VOICE_ID,
    });

    const response = await polly.send(synthCmd);

    if (!response.AudioStream) {
      throw new Error("Polly did not return an AudioStream");
    }

    const audioBuffer = await response.AudioStream.transformToByteArray();
    info({ ...logContext, size: audioBuffer.length }, `✅ TTS Chunk ${index} synthesized`);

    return { index, success: true, size: audioBuffer.length, url };
  } catch (err) {
    error(
      { ...logContext, message: err.message, stack: err.stack?.split("\n").slice(0, 3) },
      "❌ TTS Chunk Failure"
    );
    return { index, success: false, error: err.message, url };
  }
}

// ------------------------------------------------------------
// 🧩 Main Processor
// ------------------------------------------------------------
export async function ttsProcessor({ sessionId, chunks }) {
  const sid = sessionId || `session-${Date.now()}`;
  info({ sessionId: sid, model: "Amazon Polly", voice: VOICE_ID, region: REGION }, "🎧 Starting TTS Processor");

  if (!Array.isArray(chunks) || chunks.length === 0) {
    throw new Error("No valid text chunks provided to TTS Processor.");
  }

  const hb = startHeartbeat(`ttsProcessor:${sid}`);
  const results = [];
  const limit = TTS_CONCURRENCY;

  try {
    for (let i = 0; i < chunks.length; i += limit) {
      const slice = chunks.slice(i, i + limit);
      const batchResults = await Promise.all(slice.map(c => processChunk({ ...c, sessionId: sid })));
      results.push(...batchResults);
    }

    const successCount = results.filter(r => r.success).length;
    const failCount = results.filter(r => !r.success).length;
    const failedUrls = results.filter(r => !r.success).map(r => r.url);

    info(
      { sessionId: sid, successCount, failCount, total: results.length, failedUrls },
      "🎧 TTS Summary"
    );

    if (successCount === 0) throw new Error("No TTS chunks were produced or returned.");

    return results;
  } finally {
    stopHeartbeat(hb);
  }
}

export default { ttsProcessor };
