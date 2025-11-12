// ============================================================
// 🎙️ TTS Processor — Robust w/ Retries & Strict Failure Handling
// ============================================================
// - Cleans & truncates text
// - Retries transient synth & upload failures using utils/retry.js
// - Enforces that ALL chunks must succeed (orchestration will abort)
// ============================================================

import { PollyClient, SynthesizeSpeechCommand } from "@aws-sdk/client-polly";
import { info, warn, error } from "#logger.js";
import { putObject } from "#shared/r2-client.js";
import { withRetries } from "../../../utils/retry.js";

const REGION = process.env.AWS_REGION || "eu-west-2";
const VOICE_ID = process.env.POLLY_VOICE_ID || "Matthew";
const CONCURRENCY = Math.max(1, Number(process.env.TTS_CONCURRENCY || 3));

const R2_PUBLIC_BASE_URL_RAW_TEXT = process.env.R2_PUBLIC_BASE_URL_RAW_TEXT;
const R2_PUBLIC_BASE_URL_CHUNKS = process.env.R2_PUBLIC_BASE_URL_CHUNKS;
const R2_BUCKET_CHUNKS = process.env.R2_BUCKET_CHUNKS || "podcast-chunks";

function requireEnv(name, val) {
  if (!val) throw new Error(`Missing required env: ${name}`);
}

requireEnv("R2_PUBLIC_BASE_URL_RAW_TEXT", R2_PUBLIC_BASE_URL_RAW_TEXT);
requireEnv("R2_PUBLIC_BASE_URL_CHUNKS", R2_PUBLIC_BASE_URL_CHUNKS);
requireEnv("R2_BUCKET_CHUNKS", R2_BUCKET_CHUNKS);

const polly = new PollyClient({
  region: REGION,
  credentials:
    process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
      ? {
          accessKeyId: process.env.AWS_ACCESS_KEY_ID,
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        }
      : undefined,
});

function cleanText(s) {
  if (!s) return "";
  // Basic cleanup; Polly handles plain text
  return String(s)
    .replace(/\s+/g, " ")
    .replace(/[<>]/g, "") // avoid accidental SSML
    .trim()
    .slice(0, 4000); // Polly hard-ish cap for safety
}

async function synthesize(text) {
  const cmd = new SynthesizeSpeechCommand({
    Text: text,
    OutputFormat: "mp3",
    VoiceId: VOICE_ID,
    Engine: "neural",
  });
  const res = await polly.send(cmd);
  const chunks = [];
  for await (const c of res.AudioStream) chunks.push(c);
  return Buffer.concat(chunks);
}

async function createChunk(sessionId, chunkNumber, rawText) {
  const name = `tts:chunk-${chunkNumber}`;
  const cleaned = cleanText(rawText);
  if (!cleaned) throw new Error(`Empty or invalid text in chunk ${chunkNumber}`);

  // Retry synthesis
  const audioBuffer = await withRetries(
    () => synthesize(cleaned),
    { retries: 4, delay: 2000, context: `${name}:synth` }
  );

  // Retry upload
  const key = `${sessionId}/audio-${String(chunkNumber).padStart(3, "0")}.mp3`;
  await withRetries(
    () => putObject("chunks", key, audioBuffer, "audio/mpeg"),
    { retries: 4, delay: 2000, context: `${name}:upload` }
  );

  const url = `${R2_PUBLIC_BASE_URL_CHUNKS}/${encodeURIComponent(key)}`;
  info({ sessionId, key, bytes: audioBuffer.length }, `✅ TTS chunk ${chunkNumber} uploaded`);
  return { success: true, index: chunkNumber, url };
}

export async function ttsProcessor(sessionId, textChunks) {
  info({ sessionId }, "🎙 TTS Processor Start");
  if (!Array.isArray(textChunks) || textChunks.length === 0) {
    throw new Error("ttsProcessor requires a non-empty textChunks array");
  }

  const results = new Array(textChunks.length);
  let nextIndex = 0;
  let active = 0;

  await new Promise((resolve) => {
    const launch = () => {
      while (active < CONCURRENCY && nextIndex < textChunks.length) {
        const idx = nextIndex++;
        active++;
        const n = idx + 1;

        createChunk(sessionId, n, textChunks[idx])
          .then((res) => {
            results[idx] = res;
          })
          .catch((err) => {
            error({ sessionId, idx: n, err: err?.message || String(err) }, "❌ TTS Chunk Failure");
            results[idx] = { success: false, index: n, error: err?.message || String(err) };
          })
          .finally(() => {
            active--;
            if (nextIndex >= textChunks.length && active === 0) resolve();
            else launch();
          });
      }
    };
    launch();
  });

  const success = results.filter((r) => r?.success).length;
  const fail = results.length - success;
  info({ sessionId, success, fail }, "🎧 TTS Summary");

  if (fail > 0) {
    // Abort early: require all chunks for merge to be stable.
    const failedIdx = results
      .map((r, i) => (!r || !r.success ? i + 1 : null))
      .filter(Boolean);
    throw new Error(`TTS failed for chunks: [${failedIdx.join(", ")}]`);
  }

  // Return in ascending order
  return results;
}

export default { ttsProcessor };
