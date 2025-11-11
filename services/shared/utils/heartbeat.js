// ============================================================
// 🌡 Keep-Alive Utility — Safe, minimal, and backward compatible
// ============================================================

import { info } from "#logger.js";

const KEEP_ALIVE_KEY = Symbol.for("__app_keepalive_timer__");

/**
 * Starts a silent keep-alive pulse.
 * Prints a single dot periodically to keep container active.
 */
export function startKeepAlive(label = "KeepAlive", intervalMs = 120000) {
  stopKeepAlive();
  info(`🌡 Starting keep-alive for ${label} (every ${intervalMs / 1000}s)`);

  const timer = setInterval(() => {
    process.stdout.write(".");
  }, intervalMs);

  globalThis[KEEP_ALIVE_KEY] = timer;
}

/**
 * Stops the active keep-alive timer.
 */
export function stopKeepAlive() {
  const timer = globalThis[KEEP_ALIVE_KEY];
  if (timer) {
    clearInterval(timer);
    globalThis[KEEP_ALIVE_KEY] = null;
    info("🌡 Keep-alive stopped.");
  }
}

// ✅ Legacy export aliases for backward compatibility
export const startHeartbeat = startKeepAlive;
export const stopHeartbeat = stopKeepAlive;

// ✅ Default export (for import startKeepAlive from ...)
export default startKeepAlive;
