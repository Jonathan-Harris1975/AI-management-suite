// services/tts/utils/orchestrator.js
// ============================================================
// 🔊 TTS Orchestrator (webhook-free, shared R2 client)
// ============================================================

import { putJson } from "../../shared/utils/r2-client.js";
import { info, error } from "../../shared/utils/logger.js";

async function resolveSynth() {
  const candidates = [
    { mod: "../synthesize.js", fns: ["default", "synthesize", "runTTS"] },
    { mod: "../index.js",      fns: ["runTTS", "synthesize", "default"] },
    { mod: "../tts.js",        fns: ["runTTS", "synthesize", "default"] },
  ];
  for (const c of candidates) {
    try {
      const m = await import(c.mod);
      for (const name of c.fns) {
        if (typeof m[name] === "function") return m[name];
      }
    } catch (_) {}
  }
  throw new Error("No TTS synth module found");
}

export async function orchestrateTTS({ sessionId, text, voiceId }) {
  info("🔊 Starting TTS orchestration", { sessionId });

  const synthesize = await resolveSynth();
  const result = await synthesize({ sessionId, text, voiceId });

  const bucket = process.env.R2_BUCKET_PODCAST || process.env.R2_BUCKET_META;
  const key = `tts/${sessionId}.json`;
  await putJson(bucket, key, result);

  info("🔊 TTS saved to R2", { bucket, key });
  return result;
}

export default orchestrateTTS;
