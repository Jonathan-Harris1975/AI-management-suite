// ============================================================
// 🎬 TTS Orchestrator — Full Audio Generation Pipeline (Fixed)
// ============================================================
//
// ✅ Lists .txt chunks from R2 (raw-text)
// ✅ Passes them to ttsProcessor() correctly
// ✅ Continues through merge, editing, and upload
// ============================================================

import { info, error } from "#logger.js";
import { startKeepAlive, stopKeepAlive } from "#shared/keepalive.js";
import { listKeys } from "#shared/r2-client.js";
import { ttsProcessor } from "./ttsProcessor.js";
import { mergeProcessor } from "./mergeProcessor.js";
import { editingProcessor } from "./editingProcessor.js";
import { podcastProcessor } from "./podcastProcessor.js";
import { putObject } from "#shared/r2-client.js";

// ------------------------------------------------------------
// ⚙️ Environment Configuration
// ------------------------------------------------------------
const RAW_TEXT_BUCKET = process.env.R2_BUCKET_RAW_TEXT ;
const RAW_TEXT_BASE_URL = process.env.R2_PUBLIC_BASE_URL_RAW_TEXT;
const FINAL_BUCKET = process.env.R2_BUCKET_PODCAST ;
const PUBLIC_BASE_URL_PODCAST = process.env.R2_PUBLIC_BASE_URL_PODCAST;

if (!FINAL_BUCKET) throw new Error("❌ Missing R2_BUCKET_PODCAST environment variable");
if (!PUBLIC_BASE_URL_PODCAST)
  info("ℹ️ Using default public base URL for podcast R2 uploads");

// ------------------------------------------------------------
// 🚀 Main Orchestration
// ------------------------------------------------------------
export async function orchestrateTTS(session) {
  const sessionId =
    typeof session === "object" && session?.sessionId ? session.sessionId : session;
  const t0 = Date.now();
  info("🎬 Orchestration begin", { sessionId });

  try {
    startKeepAlive("ttsProcessor", 120000);

    // -----------------------------------------------------------
    // 1️⃣ Build chunk list from R2 raw-text bucket
    // -----------------------------------------------------------
    info("🔍 Listing text chunks from R2...", { sessionId });
    const chunkKeys = await listKeys(RAW_TEXT_BUCKET, `${sessionId}/chunk-`);

    if (!chunkKeys || chunkKeys.length === 0) {
      throw new Error(`No .txt chunks found in R2 for session ${sessionId}`);
    }

    const chunkList = chunkKeys
      .filter((key) => key.endsWith(".txt"))
      .sort()
      .map((key) => ({
        key,
        url: `${RAW_TEXT_BASE_URL}/${encodeURIComponent(key)}`,
      }));

    info("🧩 Text chunks collected", { sessionId, count: chunkList.length });

    // -----------------------------------------------------------
    // 2️⃣ Generate TTS chunks
    // -----------------------------------------------------------
    const t1 = Date.now();
    const ttsResults = await ttsProcessor(sessionId, chunkList);
    const successUrls = ttsResults
      .filter((r) => r.success)
      .map((r) => r.url);

    if (successUrls.length === 0)
      throw new Error("No valid TTS chunks were produced.");
    info("🗣️ TTS complete", { sessionId, count: successUrls.length, ms: Date.now() - t1 });

    // -----------------------------------------------------------
    // 3️⃣ Merge those chunks locally with ffmpeg -> upload merged MP3
    // -----------------------------------------------------------
    const t2 = Date.now();
    const merged = await mergeProcessor(sessionId, successUrls);
    if (!merged?.key) throw new Error("Merge step failed to produce an R2 key.");
    info("🧩 Merge complete", { sessionId, key: merged.key, ms: Date.now() - t2 });

    // -----------------------------------------------------------
    // 4️⃣ Optional editing (normalize, apply intro/outro)
    // -----------------------------------------------------------
    const t3 = Date.now();
    const editedBuffer = await editingProcessor(sessionId, merged);
    if (!editedBuffer?.length)
      throw new Error("Editing step returned no audio data.");
    info("✂️ Editing complete", { sessionId, bytes: editedBuffer.length, ms: Date.now() - t3 });

    // -----------------------------------------------------------
    // 5️⃣ Mixdown & Mastering
    // -----------------------------------------------------------
    const t4 = Date.now();
    const finalAudio = await podcastProcessor(sessionId, editedBuffer);
    if (!finalAudio?.length)
      throw new Error("Mixdown step returned no audio data.");
    info("🎚️ Mixdown complete", { sessionId, bytes: finalAudio.length, ms: Date.now() - t4 });

    // -----------------------------------------------------------
    // 6️⃣ Upload final MP3 to R2
    // -----------------------------------------------------------
    const key = `${sessionId}.mp3`;
    await putObject(FINAL_BUCKET, key, finalAudio, "audio/mpeg");
    const publicUrl = `${PUBLIC_BASE_URL_PODCAST}/${encodeURIComponent(key)}`;
    info("💾 Uploaded final MP3 to R2", { sessionId, key, publicUrl, totalMs: Date.now() - t0 });

    return { ok: true, sessionId, file: key, url: publicUrl };
  } catch (err) {
    error("💥 TTS orchestration failed", { sessionId, error: err?.stack || err?.message });
    throw err;
  }
}

export default orchestrateTTS;
