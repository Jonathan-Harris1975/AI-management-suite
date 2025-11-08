// ============================================================
// 🔊 TTS Orchestrator — Full Audio Generation Pipeline
// ============================================================

import { info, error } from "#logger.js";
import { ttsProcessor } from "./ttsProcessor.js";
import { mergeProcessor } from "./mergeProcessor.js";
import { editingProcessor } from "./editingProcessor.js";
import { podcastProcessor } from "./podcastProcessor.js";
import { putObject } from "#shared/r2-client.js";

// Normalize ID if called via object { sessionId: "..." }
const normalize = (s) => (typeof s === "object" && s.sessionId ? s.sessionId : s);

export async function orchestrateTTS(session) {
  const sessionId = normalize(session);
  info({ sessionId }, "🎙 Starting full TTS orchestration pipeline");

  try {
    // 1️⃣ Generate TTS chunks
    const ttsFiles = await ttsProcessor(sessionId);
    info({ sessionId, count: ttsFiles?.length || 0 }, "✅ TTS chunks generated");

    // 2️⃣ Merge chunks → main voice file
    const mergedPath = await mergeProcessor(sessionId, ttsFiles);
    info({ sessionId, mergedPath }, "✅ Chunks merged successfully");

    // 3️⃣ Apply audio editing → humanize tone, EQ, compression, etc.
    const editedPath = await editingProcessor(sessionId, mergedPath);
    info({ sessionId, editedPath }, "✅ Audio editing complete");

    // 4️⃣ Combine intro/outro with processed voice track
    const finalAudio = await podcastProcessor(sessionId, editedPath);
    info({ sessionId, finalAudio }, "✅ Podcast mixdown complete");

    // 5️⃣ Upload to R2
    const key = `${sessionId}.mp3`;
    await putObject("podcast", key, finalAudio, "audio/mpeg");
    info({ sessionId, key }, "💾 Uploaded final podcast MP3 to R2");

    return { ok: true, sessionId, file: key };
  } catch (err) {
    error({ sessionId, error: err.message }, "💥 TTS orchestration failed");
    throw err;
  }
}

export default orchestrateTTS;
