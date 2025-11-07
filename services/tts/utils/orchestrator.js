// services/tts/utils/orchestrator.js
// ============================================================
// 🔊 TTS Orchestrator — Gemini-only, unified exports
// ============================================================

import { log } from "#logger.js";
import { processTTS } from "./ttsProcessor.js";

/**
 * Orchestrate TTS synthesis for a given session.
 * Compatible with Gemini 2.5 TTS pipeline.
 *
 * @param {object} params
 * @param {string} params.sessionId - Unique session ID.
 * @param {string} [params.voiceName] - Optional Gemini voice name override.
 * @returns {Promise<object>} TTS synthesis result metadata.
 */
export async function orchestrateTTS({ sessionId, voiceName } = {}) {
  if (!sessionId) throw new Error("sessionId is required");

  log.info({ sessionId, voiceName }, "🔊 Starting TTS orchestration (Gemini)");

  const result = await processTTS(sessionId, { voiceName });

  log.info(
    { sessionId, produced: result.produced },
    "🔊 TTS orchestration complete"
  );

  return result;
}

// Support both default and named imports
export default orchestrateTTS;
