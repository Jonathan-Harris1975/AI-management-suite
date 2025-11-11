// ============================================================
// 🌡 Keep-Alive Utility — Silent version for long tasks
// ============================================================
//
// Keeps container alive by sending minimal signals at safe intervals.
// Uses a single low-frequency timer (default: 2 minutes).
//

import { info } from "#logger.js";

const KEEP_ALIVE_KEY = Symbol.for("__app_keepalive_timer__");

/**
 * Starts a minimal keep-alive pulse to prevent idle timeouts.
 * Does NOT spam logs — only logs once per start and stop.
 *
 * @param {string} label - Identifier for context (e.g. "TTS Pipeline")
 * @param {number} intervalMs - Interval in ms (default 2 minutes)
 */
export function startKeepAlive(label = "KeepAlive", intervalMs = 120000) {
  stopKeepAlive();
  info(`🌡 Starting keep-alive for ${label} (every ${intervalMs / 1000}s)`);

  const timer = setInterval(() => {
    process.stdout.write("."); // single dot, no newline — keeps process active
  }, intervalMs);

  globalThis[KEEP_ALIVE_KEY] = timer;
}

/**
 * Stops any active keep-alive pulse.
 */
export function stopKeepAlive() {
  const timer = globalThis[KEEP_ALIVE_KEY];
  if (timer) {
    clearInterval(timer);
    globalThis[KEEP_ALIVE_KEY] = null;
    info("🌡 Keep-alive stopped.");
  }
}

export default startKeepAlive;
