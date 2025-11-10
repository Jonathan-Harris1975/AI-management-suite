// services/tts/utils/ttsProcessor.js
// ============================================================
// 🎙 TTS Processor — Amazon Polly (URL-based chunk ingestion)
// ============================================================
//
// ✅ Features
//  • Reads text chunks directly from R2 public URLs
//  • Uses Amazon Polly neural voice (UK Brian by default)
//  • Logs detailed success/failure per chunk
//  • Returns summary for orchestrator
// ============================================================

import { PollyClient, SynthesizeSpeechCommand } from "@aws-sdk/client-polly";
import { info, error, warn } from "#logger.js";
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
  if (!res.ok) throw new Error(`Failed to fetch chunk: ${url} (${res.status})`);
  return await res.text();
}

// ------------------------------------------------------------
// 🔊 Process a single chunk with Polly
// ------------------------------------------------------------
async function processChunk({ sessionId, index, url }) {
  try {
    const text = await fetchChunkText(url);
    if (!text || !text.trim()) throw new Error("Empty chunk text");

    const synthCmd = new SynthesizeSpeechCommand({
      OutputFormat: "mp3",
      Engine: "neural",
      Text: text,
      VoiceId: VOICE_ID,
    });

    const response = await polly.send(synthCmd);
    const audioBuffer = await response.AudioStream.transformToByteArray();

    info({ sessionId, index }, `✅ TTS Chunk ${index} succeeded`);
    return { index, success: true, size: audioBuffer.length };
  } catch (err) {
    error({ sessionId, index, message: err.message }, "❌ TTS Chunk Failure");
    return { index, success: false, error: err.message };
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

    info(
      { sessionId: sid, successCount, failCount, total: results.length },
      "🎧 TTS Summary"
    );

    if (successCount === 0) throw new Error("No TTS chunks were produced or returned.");

    return results;
  } finally {
    stopHeartbeat(hb);
  }
}

export default { ttsProcessor };
