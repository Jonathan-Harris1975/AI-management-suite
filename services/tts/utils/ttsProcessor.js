// ============================================================
// 🎧 TTS Processor — Cloud-Aware Chunk Orchestration
// ============================================================
//
// ✅ Fetches chunk text files from raw-text R2 bucket
// ✅ Converts each text chunk to audio via Polly/Google
// ✅ Uploads resulting MP3s to podcast-chunks bucket
// ✅ Returns array of public URLs for mergeProcessor
// ============================================================

import { info, error } from "#logger.js";
import { listKeys, getObject } from "#shared/r2-client.js";
import { synthesizeSpeech } from "#shared/tts-engine.js";
import { putObject } from "#shared/r2-client.js";
import { startKeepAlive } from "../../shared/utils/heartbeat.js";

// ------------------------------------------------------------------
// ⚙️ Environment
// ------------------------------------------------------------------
const RAW_TEXT_BUCKET = process.env.R2_BUCKET_RAW_TEXT || "raw-text";
const CHUNKS_BUCKET = process.env.R2_BUCKET_CHUNKS || "podcast-chunks";
const RAW_TEXT_BASE_URL = process.env.R2_PUBLIC_BASE_URL_RAW_TEXT;
const CHUNKS_BASE_URL = process.env.R2_PUBLIC_BASE_URL_CHUNKS;

// ------------------------------------------------------------------
// 🎙️ Main
// ------------------------------------------------------------------
export async function ttsProcessor(sessionId) {
  try {
    startKeepAlive("ttsProcessor", 120000);
    info({ sessionId }, "🎙 TTS Processor Start");

    // -----------------------------------------------------------
    // 1️⃣ List raw text chunks from R2
    // -----------------------------------------------------------
    const prefix = `${sessionId}/chunk-`;
    const chunkKeys = await listKeys(RAW_TEXT_BUCKET, prefix);
    if (!chunkKeys || chunkKeys.length === 0) {
      throw new Error(`No text chunks found in R2 for session ${sessionId}`);
    }

    info({ sessionId, count: chunkKeys.length }, "🧩 Found text chunks in R2");

    const audioUrls = [];

    // -----------------------------------------------------------
    // 2️⃣ Process each text chunk
    // -----------------------------------------------------------
    for (const [i, key] of chunkKeys.entries()) {
      if (!key.endsWith(".txt")) continue;

      const chunkName = key.split("/").pop();
      const outputKey = `${sessionId}/${chunkName.replace(".txt", ".mp3")}`;

      try {
        info({ sessionId, chunk: chunkName }, "🔍 Fetching text chunk from R2...");
        const textBuffer = await getObject(RAW_TEXT_BUCKET, key);
        const text = textBuffer.toString("utf8").trim();

        if (!text) throw new Error("Empty text chunk");

        info({ sessionId, chunk: chunkName }, "🗣️ Synthesizing speech...");
        const audioBuffer = await synthesizeSpeech(text);

        await putObject(CHUNKS_BUCKET, outputKey, audioBuffer, "audio/mpeg");

        const publicUrl = `${CHUNKS_BASE_URL}/${encodeURIComponent(outputKey)}`;
        audioUrls.push(publicUrl);

        info(
          { sessionId, index: i + 1, url: publicUrl },
          "✅ TTS chunk complete"
        );
      } catch (err) {
        error({ sessionId, chunk: key, err: err.message }, "❌ TTS Chunk Failure");
      }
    }

    // -----------------------------------------------------------
    // 3️⃣ Return URLs for merge
    // -----------------------------------------------------------
    if (audioUrls.length === 0)
      throw new Error("No TTS chunks were successfully processed.");

    info({ sessionId, count: audioUrls.length }, "🎧 TTS complete");
    return audioUrls;
  } catch (err) {
    error({ sessionId, error: err.message }, "💥 TTS Processor failed");
    throw err;
  }
}

export default ttsProcessor;
