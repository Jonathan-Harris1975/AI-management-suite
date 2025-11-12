// ============================================================
// 🎙️ TTS Processor — Plain Text Only (NO SSML), Polly Neural
// ============================================================
// - Cleans text without SSML
// - Polly Neural voice synthesis using standard text
// - Legacy retry() signature fully supported
// - Stable concurrency queue
// - Strict "all chunks required" policy
// ============================================================

import { PollyClient, SynthesizeSpeechCommand } from "@aws-sdk/client-polly";
import { info, warn, error } from "#logger.js";
import { putObject } from "#shared/r2-client.js";
import { withRetries } from "../../../utils/retry.js";

// ------------------------------------------------------------
// 🔧 ENV
// ------------------------------------------------------------
const REGION = process.env.AWS_REGION || "eu-west-2";
const VOICE_ID = process.env.POLLY_VOICE_ID || "Matthew";
const CONCURRENCY = Math.max(1, Number(process.env.TTS_CONCURRENCY || 3));
const BUCKET = process.env.R2_BUCKET_RAW || "podcast-chunks";
const PREFIX = process.env.R2_PREFIX || "chunks";
const MAX_CHARS = 4800; // Polly safe-text limit

// ------------------------------------------------------------
// 🔧 Polly Client
// ------------------------------------------------------------
const polly = new PollyClient({ region: REGION });

// ------------------------------------------------------------
// 🧼 Clean Text (NO SSML ALLOWED)
// ------------------------------------------------------------
function cleanText(text) {
  if (!text) return "";

  let t = text
    .replace(/\s+/g, " ")
    .replace(/[<>]/g, "")  // strip brackets entirely
    .replace(/&/g, "and")  // avoid XML-style breaks
    .trim();

  if (t.length > MAX_CHARS) t = t.slice(0, MAX_CHARS);

  return t;
}

// ------------------------------------------------------------
// 🗣️ Synthesise Audio (plain text, Neural)
// ------------------------------------------------------------
async function synthesize(text) {
  const command = new SynthesizeSpeechCommand({
    OutputFormat: "mp3",
    TextType: "text",     // <-- crucial: no SSML
    Text: text,
    VoiceId: VOICE_ID,
    Engine: "neural"
  });

  const res = await polly.send(command);
  return Buffer.from(await res.AudioStream.transformToByteArray());
}

// ------------------------------------------------------------
// ☁️ Upload Chunk to R2
// ------------------------------------------------------------
async function uploadChunk(sessionId, index, audioBuffer) {
  const key = `${PREFIX}/${sessionId}/chunk-${index}.mp3`;

  await putObject({
    bucket: BUCKET,
    key,
    body: audioBuffer,
    contentType: "audio/mpeg"
  });

  return key;
}

// ------------------------------------------------------------
// 🚀 MAIN PROCESSOR
// ------------------------------------------------------------
export async function ttsProcessor({ sessionId, chunks }) {
  info({ sessionId }, "🎙 Plain-Text TTS Processor Start");

  if (!Array.isArray(chunks) || chunks.length === 0) {
    throw new Error("No chunks supplied to ttsProcessor");
  }

  const results = new Array(chunks.length);
  let active = 0;
  let cursor = 0;

  return new Promise((resolve, reject) => {
    const next = () => {
      if (cursor >= chunks.length && active === 0) {
        // Validate success
        const failed = results
          .map((r, idx) => (!r || !r.success ? idx + 1 : null))
          .filter(Boolean);

        if (failed.length) {
          reject(new Error(`TTS failed for chunks: [${failed.join(", ")}]`));
        } else {
          resolve(results);
        }
        return;
      }

      while (active < CONCURRENCY && cursor < chunks.length) {
        const index = cursor++;
        active++;

        const raw = chunks[index];
        const cleaned = cleanText(raw);
        const ctx = `chunk-${index + 1}`;

        info({ sessionId, index: index + 1 }, "🎧 Synth start");

        // -----------------------------------------------------
        // 🔁 Retry-safe synthesis
        // -----------------------------------------------------
        withRetries(`${ctx}:synth`, () => synthesize(cleaned), 4, 2000)
          .then((audioBuf) =>
            withRetries(
              `${ctx}:upload`,
              () => uploadChunk(sessionId, index + 1, audioBuf),
              4,
              2000
            ).then((key) => {
              results[index] = { success: true, key };
            })
          )
          .catch((err) => {
            error(
              { err: err?.message, sessionId, index: index + 1 },
              "❌ Chunk Failure"
            );
            results[index] = { success: false, error: err };
          })
          .finally(() => {
            active--;
            next();
          });
      }
    };

    next();
  });
}

export default { ttsProcessor };
