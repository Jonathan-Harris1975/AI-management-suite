// ============================================================
// 🔊 TTS Orchestrator (Hybrid R2 + Gemini / Google)
// ============================================================

import { info, error, warn } from "#logger.js";
import { getObjectAsText, uploadBuffer, buildPublicUrl } from "#shared/r2-client.js";
import { synthesizeTTS } from "../engine/ttsEngine.js";

// ------------------------------------------------------------
// 🧩 Helper
// ------------------------------------------------------------

function normalizeSessionId(input) {
  return typeof input === "object" && input.sessionId ? input.sessionId : input;
}

// ------------------------------------------------------------
// 🎙️ Main Orchestration
// ------------------------------------------------------------

export async function orchestrateTTS(session) {
  const sessionId = normalizeSessionId(session);
  info({ sessionId }, "🎙 Starting TTS orchestration");

  try {
    // --------------------------------------------------------
    // 1️⃣ Fetch raw text for this episode
    // --------------------------------------------------------
    const key = `${sessionId}.txt`;
    const url = buildPublicUrl("rawtext", key);
    info({ key, url }, "🔍 Fetching raw text from R2");

    let text;
    try {
      text = await getObjectAsText("rawtext", key);
    } catch (err) {
      error({ key, err: err.message }, "💥 Failed to fetch raw text chunks");
      throw new Error(`No raw text found for ${key}`);
    }

    if (!text || text.trim().length < 5) {
      throw new Error(`Empty or invalid raw text for ${sessionId}`);
    }

    // --------------------------------------------------------
    // 2️⃣ Send text to TTS synthesis engine
    // --------------------------------------------------------
    const audioBuffer = await synthesizeTTS(sessionId, text);
    info({ sessionId, bytes: audioBuffer?.length || 0 }, "🔊 TTS synthesis complete");

    // --------------------------------------------------------
    // 3️⃣ Upload synthesized audio to R2
    // --------------------------------------------------------
    const audioKey = `${sessionId}.mp3`;
    const audioUrl = await uploadBuffer("podcast", audioKey, audioBuffer, "audio/mpeg");
    info({ sessionId, audioUrl }, "💾 TTS audio uploaded to R2");

    return { ok: true, audioUrl };
  } catch (err) {
    error({ sessionId, error: err.message }, "💥 TTS orchestration failed");
    throw err;
  }
}

export default orchestrateTTS;
