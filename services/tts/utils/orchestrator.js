// services/tts/utils/orchestrator.js
// Simplified orchestrator – Gemini-only
import { log } from "#logger.js";
import { processTTS } from "./ttsProcessor.js";

export default async function orchestrateTTS({ sessionId, voiceName } = {}) {
  if (!sessionId) throw new Error("sessionId is required");
  log.info({ sessionId, voiceName }, "🔊 Starting TTS orchestration (Gemini)");
  const result = await processTTS(sessionId, { voiceName });
  log.info({ sessionId, produced: result.produced }, "🔊 TTS orchestration complete");
  return result;
}
