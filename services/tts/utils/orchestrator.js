// ============================================================
// 🔊 TTS Orchestrator — Full Audio Generation Pipeline
// 1) Generate TTS chunks -> 2) Merge -> 3) Editing -> 4) Mixdown
// -> 5) Upload final MP3 to R2
// ============================================================

import { info, error } from "#logger.js";
import { ttsProcessor } from "./ttsProcessor.js";
import { mergeProcessor } from "./mergeProcessor.js";
import { editingProcessor } from "./editingProcessor.js";
import { podcastProcessor } from "./podcastProcessor.js";
import { putObject } from "#shared/r2-client.js";
import startHeartbeat from "../../shared/utils/heartbeat.js"; // ✅ fixed verified path

// ------------------------------------------------------------
// ⚙️ Environment Configuration
// ------------------------------------------------------------
const FINAL_BUCKET = process.env.R2_BUCKET_PODCAST || "podcast";
const PUBLIC_BASE_URL_PODCAST = process.env.R2_PUBLIC_BASE_URL_PODCAST;

if (!FINAL_BUCKET) throw new Error("❌ Missing R2_BUCKET_PODCAST environment variable");
if (!PUBLIC_BASE_URL_PODCAST) info("ℹ️ Using default public base URL for podcast R2 uploads");

// ------------------------------------------------------------
// 🔧 Normalizer
// ------------------------------------------------------------
const normalize = (s) =>
  typeof s === "object" && s?.sessionId ? s.sessionId : s;

// ------------------------------------------------------------
// 🚀 Main Orchestration
// ------------------------------------------------------------
export async function orchestrateTTS(session) {
  const sessionId = normalize(session);
  const t0 = Date.now();
  info({ sessionId }, "🎬 Orchestration begin");

  try {
    startHeartbeat("ttsProcessor", sessionId);

    // 1️⃣ Generate TTS chunks (returns array of PUBLIC URLs)
    const t1 = Date.now();
    const chunkUrls = await ttsProcessor(sessionId);
    if (!chunkUrls?.length) {
      throw new Error(
        "No TTS chunks were produced. Check raw-text inputs and TTS credentials."
      );
    }
    info(
      { sessionId, count: chunkUrls.length, ms: Date.now() - t1 },
      "🗣️ TTS complete"
    );

    // 2️⃣ Merge those chunks locally with ffmpeg -> upload merged MP3
    const t2 = Date.now();
    const merged = await mergeProcessor(sessionId, chunkUrls); // { key, localPath }
    if (!merged?.key)
      throw new Error("Merge step failed to produce an R2 key.");
    info(
      { sessionId, key: merged.key, ms: Date.now() - t2 },
      "🧩 Merge complete"
    );

    // 3️⃣ Optional editing (intros/outros/normalization/effects) -> returns buffer
    const t3 = Date.now();
    const editedBuffer = await editingProcessor(sessionId, merged);
    if (!editedBuffer?.length)
      throw new Error("Editing step returned no audio data.");
    info(
      { sessionId, bytes: editedBuffer.length, ms: Date.now() - t3 },
      "✂️ Editing complete"
    );

    // 4️⃣ Mix with intro/outro and mastering -> returns final Buffer
    const t4 = Date.now();
    const finalAudio = await podcastProcessor(sessionId, editedBuffer);
    if (!finalAudio?.length)
      throw new Error("Mixdown step returned no audio data.");
    info(
      { sessionId, bytes: finalAudio.length, ms: Date.now() - t4 },
      "🎚️ Mixdown complete"
    );

    // 5️⃣ Upload final MP3 to R2
    const key = `${sessionId}.mp3`;
    await putObject(FINAL_BUCKET, key, finalAudio, "audio/mpeg");
    const publicUrl = `${PUBLIC_BASE_URL_PODCAST}/${encodeURIComponent(key)}`;

    info(
      { sessionId, key, publicUrl, totalMs: Date.now() - t0 },
      "💾 Uploaded final MP3 to R2"
    );

    return { ok: true, sessionId, file: key, url: publicUrl };
  } catch (err) {
    error(
      { sessionId, error: err?.stack || err?.message },
      "💥 TTS orchestration failed"
    );
    throw err;
  }
}

export default orchestrateTTS;
