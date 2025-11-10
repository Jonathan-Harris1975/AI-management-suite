// ============================================================
// 🔊 TTS Orchestrator — Public entry for the TTS service
//  - Re-exports the real orchestrator from utils/orchestrator.js
//  - Adds a heartbeat wrapper to avoid idle timeouts on hosts
// ============================================================

import { info, error } from "#logger.js";
import { startHeartbeat, stopHeartbeat } from "#shared/heartbeat.js"; // ✅ correct alias
import { orchestrateTTS as _orchestrateTTS } from "./utils/orchestrator.js";

// Normalize ID if called via object { sessionId: "..." }
const normalize = (s) => (typeof s === "object" && s?.sessionId ? s.sessionId : s);

/**
 * Orchestrate the full TTS pipeline with a heartbeat guard.
 * This keeps the container alive on platforms with idle timeouts.
 */
export async function orchestrateTTS(session) {
  const sessionId = normalize(session);
  startHeartbeat(`TTS Pipeline ${sessionId}`, 30_000);

  try {
    info({ sessionId }, "🚀 Starting TTS pipeline");
    const result = await _orchestrateTTS(sessionId);
    info({ sessionId, result }, "✅ TTS pipeline finished");
    return result;
  } catch (err) {
    error({ sessionId, error: err?.stack || err?.message }, "💥 TTS pipeline failed");
    throw err;
  } finally {
    stopHeartbeat();
  }
}

export default orchestrateTTS;
