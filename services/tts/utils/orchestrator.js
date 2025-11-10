// ============================================================
// 🔊 TTS Orchestrator — Full R2-Aware Audio Generation Pipeline
// ============================================================
//
// Steps:
// 1️⃣ List text chunks from R2_BUCKET_RAW_TEXT
// 2️⃣ Generate TTS for each chunk
// 3️⃣ Merge -> Edit -> Mixdown -> Upload
// ============================================================

import { info, error } from "#logger.js";
import { s3 } from "#shared/r2-client.js";
import { ListObjectsV2Command } from "@aws-sdk/client-s3";
import { ttsProcessor } from "./ttsProcessor.js";
import { mergeProcessor } from "./mergeProcessor.js";
import { editingProcessor } from "./editingProcessor.js";
import { podcastProcessor } from "./podcastProcessor.js";
import { putObject } from "#shared/r2-client.js";

const RAW_TEXT_BUCKET = process.env.R2_BUCKET_RAW_TEXT;
const RAW_TEXT_PUBLIC = process.env.R2_PUBLIC_BASE_URL_RAW_TEXT;
const FINAL_BUCKET = "podcast";

async function listChunks(sessionId) {
  info({ sessionId, bucket: RAW_TEXT_BUCKET }, "🔍 Listing text chunks from R2...");
  const command = new ListObjectsV2Command({
    Bucket: RAW_TEXT_BUCKET,
    Prefix: `${sessionId}/chunk-`,
  });

  const { Contents = [] } = await s3.send(command);
  const valid = Contents.filter((c) => c.Key.endsWith(".txt"))
    .sort((a, b) => a.Key.localeCompare(b.Key))
    .map((c, i) => ({
      index: i + 1,
      url: `${RAW_TEXT_PUBLIC}/${encodeURIComponent(c.Key)}`,
    }));

  info({ sessionId, count: valid.length }, "🧩 Chunks ready for TTS");
  return valid;
}

export async function orchestrateTTS(session) {
  const sessionId = typeof session === "object" ? session.sessionId : session;
  const t0 = Date.now();
  info({ sessionId }, "🎬 Orchestration begin");

  try {
    // 1️⃣ List R2 chunk URLs
    const chunks = await listChunks(sessionId);
    if (!chunks.length) throw new Error(`No chunks found for ${sessionId}.`);
    info({ sessionId, count: chunks.length }, "📜 Text chunks collected");

    // 2️⃣ Generate TTS audio
    const t1 = Date.now();
    const ttsResults = await ttsProcessor({ sessionId, chunks });
    const success = ttsResults.filter((r) => r.success);
    if (!success.length) throw new Error("No successful TTS chunks produced.");
    info({ sessionId, count: success.length, ms: Date.now() - t1 }, "🗣️ TTS complete");

    // 3️⃣ Merge
    const t2 = Date.now();
    const merged = await mergeProcessor(sessionId, success);
    if (!merged?.key) throw new Error("Merge step failed.");
    info({ sessionId, key: merged.key, ms: Date.now() - t2 }, "🧩 Merge complete");

    // 4️⃣ Editing
    const t3 = Date.now();
    const edited = await editingProcessor(sessionId, merged);
    if (!edited?.length) throw new Error("Editing returned no data.");
    info({ sessionId, bytes: edited.length, ms: Date.now() - t3 }, "✂️ Editing complete");

    // 5️⃣ Mixdown
    const t4 = Date.now();
    const finalAudio = await podcastProcessor(sessionId, edited);
    if (!finalAudio?.length) throw new Error("Mixdown returned no data.");
    info({ sessionId, bytes: finalAudio.length, ms: Date.now() - t4 }, "🎚️ Mixdown complete");

    // 6️⃣ Upload final MP3
    const key = `${sessionId}.mp3`;
    await putObject(FINAL_BUCKET, key, finalAudio, "audio/mpeg");
    info({ sessionId, key, totalMs: Date.now() - t0 }, "💾 Uploaded final MP3 to R2");

    return { ok: true, sessionId, file: key };
  } catch (err) {
    error({ sessionId, error: err.message, stack: err.stack?.split("\n").slice(0, 3) }, "💥 TTS orchestration failed");
    throw err;
  }
}

export default orchestrateTTS;
