// ============================================================
// 🌙 Silent Keep-Alive Utility — Production Safe
// ============================================================
//
// Keeps container alive during long-running processes
// without writing to logs or stdout.
//
// - Uses single global timer
// - No console or stdout spam
// - Safe for Render / Shiper environments
//

import { info } from "#logger.js";

const KEEP_ALIVE_KEY = Symbol.for("__app_keepalive_timer__");

/**
 * Start a silent keep-alive loop to prevent Render idle timeout.
 * @param {string} label - Identifier for context (e.g. "TTS Pipeline")
 * @param {number} intervalMs - Interval in ms (default: 2 minutes)
 */
export function startKeepAlive(label = "KeepAlive", intervalMs = 120000) {
  stopKeepAlive();

  info(`🌙 Silent keep-alive active for ${label} (${intervalMs / 1000}s interval)`);

  const timer = setInterval(() => {
    // Intentionally no log or output — this just keeps the Node process active.
  }, intervalMs);

  globalThis[KEEP_ALIVE_KEY] = timer;
}

/**
 * Stop the keep-alive timer.
 */
export function stopKeepAlive() {
  const timer = globalThis[KEEP_ALIVE_KEY];
  if (timer) {
    clearInterval(timer);
    globalThis[KEEP_ALIVE_KEY] = null;
    info("🌙 Keep-alive stopped.");
  }
}

// ✅ Legacy export names for backward compatibility
export const startHeartbeat = startKeepAlive;
export const stopHeartbeat = stopKeepAlive;

export default startKeepAlive;
