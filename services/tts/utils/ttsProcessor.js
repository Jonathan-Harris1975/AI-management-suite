// services/tts/utils/ttsProcessor.js
// ============================================================
// 🎙️ TTS Processor — Bulletproof Polly + R2 Upload Version
// ============================================================
//
// ✅ Reads text chunks from R2_PUBLIC_BASE_URL_RAW_TEXT
// ✅ Synthesizes speech with Amazon Polly (Neural)
// ✅ Uploads .mp3 chunks to R2_BUCKET_CHUNKS (podcast-chunks)
// ✅ Returns a clean array of valid public URLs for mergeProcessor
// ============================================================

import {
  PollyClient,
  SynthesizeSpeechCommand,
} from "@aws-sdk/client-polly";
import { info, error } from "#logger.js";
import { putObject } from "#shared/r2-client.js";
import pLimit from "p-limit";

// ------------------------------------------------------------------
// ⚙️ Config
// ------------------------------------------------------------------
const REGION = process.env.AWS_REGION || "eu-west-2";
const VOICE_ID = process.env.POLLY_VOICE_ID || "Brian";
const CONCURRENCY = parseInt(process.env.TTS_CONCURRENCY || "2", 10);

const R2_BUCKET_CHUNKS = process.env.R2_BUCKET_CHUNKS || "podcast-chunks";
const R2_PUBLIC_BASE_URL_CHUNKS =
  process.env.R2_PUBLIC_BASE_URL_CHUNKS ||
  "https://pub-f5923355782641348fc97d1a8aa9cd71.r2.dev";
const R2_PUBLIC_BASE_URL_RAW_TEXT =
  process.env.R2_PUBLIC_BASE_URL_RAW_TEXT ||
  "https://pub-7a098297d4ef4011a01077c72929753c.r2.dev";

// ------------------------------------------------------------------
// 🧠 Initialize Polly
// ------------------------------------------------------------------
const polly = new PollyClient({
  region: REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

info(
  { region: REGION, voice: VOICE_ID, concurrency: CONCURRENCY },
  "🧩 Using Amazon Polly (Neural) configuration"
);

// ------------------------------------------------------------------
// 🎧 TTS Processor
// ------------------------------------------------------------------
export async function ttsProcessor(sessionId, chunkList = []) {
  info({ sessionId }, "🎙 TTS Processor Start");

  if (!Array.isArray(chunkList) || chunkList.length === 0) {
    throw new Error("No text chunks provided to ttsProcessor");
  }

  const limit = pLimit(CONCURRENCY);
  const results = [];

  const tasks = chunkList.map((chunk, index) =>
    limit(async () => {
      const chunkNumber = index + 1;
      const key = `${sessionId}/audio-${String(chunkNumber).padStart(3, "0")}.mp3`;

      try {
        // -----------------------------------------------------------
        // 🔍 Fetch text from R2_PUBLIC_BASE_URL_RAW_TEXT
        // -----------------------------------------------------------
        const textUrl =
          chunk.url ||
          `${R2_PUBLIC_BASE_URL_RAW_TEXT}/${sessionId}/chunk-${String(
            chunkNumber
          ).padStart(3, "0")}.txt`;

        info({ sessionId, textUrl }, "🔍 Fetching chunk text from URL...");
        const res = await fetch(textUrl);
        if (!res.ok)
          throw new Error(`Failed to fetch text chunk ${chunkNumber}: ${res.status}`);
        const text = await res.text();
        if (!text.trim())
          throw new Error(`Empty text content in chunk ${chunkNumber}`);

        // -----------------------------------------------------------
        // 🗣️ Convert to speech with Amazon Polly
        // -----------------------------------------------------------
        const command = new SynthesizeSpeechCommand({
          Text: text,
          OutputFormat: "mp3",
          VoiceId: VOICE_ID,
          Engine: "neural",
        });

        const pollyResult = await polly.send(command);
        const audioBuffer = Buffer.from(
          await pollyResult.AudioStream.transformToByteArray()
        );

        // -----------------------------------------------------------
        // ☁️ Upload to R2_BUCKET_CHUNKS
        // -----------------------------------------------------------
        await putObject("chunks", key, audioBuffer, "audio/mpeg");

        const publicUrl = `${R2_PUBLIC_BASE_URL_CHUNKS}/${encodeURIComponent(key)}`;
        info(
          { sessionId, key, publicUrl, bytes: audioBuffer.length },
          "✅ TTS chunk uploaded"
        );

        results.push({
          success: true,
          index: chunkNumber,
          key,
          url: publicUrl,
          bytes: audioBuffer.length,
        });
      } catch (err) {
        error(
          { sessionId, index: chunkNumber, message: err.message },
          "❌ TTS Chunk Failure"
        );
        // Push placeholder entry to preserve index order
        results.push({
          success: false,
          index: chunkNumber,
          key,
          url: null,
          error: err.message,
        });
      }
    })
  );

  await Promise.all(tasks);

  // ------------------------------------------------------------------
  // 📊 Summary + Sanitize
  // ------------------------------------------------------------------
  const successChunks = results.filter((r) => r.success && r.url);
  const failCount = results.length - successChunks.length;

  info(
    { sessionId, total: results.length, success: successChunks.length, failed: failCount },
    "🎧 TTS Summary"
  );

  if (successChunks.length === 0)
    throw new Error("No valid TTS chunks produced — all failed.");

  info({ sessionId }, "🗣️ TTS complete");
  return successChunks;
}

// ------------------------------------------------------------------
// 📦 Default Export
// ------------------------------------------------------------------
export default { ttsProcessor };
