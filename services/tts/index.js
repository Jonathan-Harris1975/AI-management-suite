// ============================================================
// 🔊 TTS Orchestrator — Full Audio Generation Pipeline
// ============================================================

import { info, error } from "#logger.js";
import { ttsProcessor } from "./utils/ttsProcessor.js";
import { mergeProcessor } from "./utils/mergeProcessor.js";
import { editingProcessor } from "./utils/editingProcessor.js";
import { podcastProcessor } from "./utils/podcastProcessor.js";
import { putObject } from "#shared/r2-client.js";
import { startHeartbeat, stopHeartbeat } from "#shared/heartbeat.js";
// Normalize ID if called via object { sessionId: "..." }
const normalize = (s) => (typeof s === "object" && s.sessionId ? s.sessionId : s);

/**
 * Orchestrates the entire TTS pipeline:
 *  1️⃣ Generate speech chunks
 *  2️⃣ Merge chunks
 *  3️⃣ Apply EQ & humanizing edits
 *  4️⃣ Mix intro/outro and finalize
 *  5️⃣ Upload to R2
 */
export async function orchestrateTTS(session) {
  const sessionId = normalize(session);
  info({ sessionId }, "🎙 Starting full TTS orchestration pipeline");

  // 🫀 Keep container alive while long TTS runs
  startHeartbeat(`TTS-${sessionId}`, 25000);

  try {
    // 1️⃣ Generate TTS chunks
    const ttsFiles = await ttsProcessor(sessionId);
    info({ sessionId, count: ttsFiles?.length || 0 }, "✅ TTS chunks generated");

    // 2️⃣ Merge chunks → single track
    const mergedPath = await mergeProcessor(sessionId, ttsFiles);
    info({ sessionId, mergedPath }, "✅ Chunks merged successfully");

    // 3️⃣ Apply audio processing (EQ, compression, normalization)
    const editedPath = await editingProcessor(sessionId, mergedPath);
    info({ sessionId, editedPath }, "✅ Audio editing complete");

    // 4️⃣ Combine with intro/outro and render final mix
    const finalAudio = await podcastProcessor(sessionId, editedPath);
    info({ sessionId, finalAudio }, "✅ Podcast mixdown complete");

    // 5️⃣ Upload finished podcast to R2
    const key = `${sessionId}.mp3`;
    await putObject("podcast", key, finalAudio, "audio/mpeg");
    info({ sessionId, key }, "💾 Uploaded final podcast MP3 to R2");

    stopHeartbeat();
    return { ok: true, sessionId, file: key };
  } catch (err) {
    error({ sessionId, error: err.message }, "💥 TTS orchestration failed");
    stopHeartbeat();
    throw err;
  }
}

export default orchestrateTTS;
