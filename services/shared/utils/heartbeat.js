// ============================================================
// ❤️ Heartbeat Utility — Keeps container alive during long tasks
// ============================================================

import { info } from "#logger.js";

let interval = null;

/**
 * Starts a heartbeat log every N seconds to prevent idle timeout.
 * @param {string} label - Identifier for logs, e.g. "TTS Pipeline"
 * @param {number} ms - Interval in milliseconds (default: 30s)
 */
export function startHeartbeat(label = "Heartbeat", ms = 30000) {
  stopHeartbeat();
  info({ label }, `💚 Starting heartbeat for ${label}`);
  interval = setInterval(() => {
    info({ label, time: new Date().toISOString() }, "💓 Heartbeat tick");
  }, ms);
}

/**
 * Stops any active heartbeat interval.
 */
export function stopHeartbeat() {
  if (interval) {
    clearInterval(interval);
    interval = null;
  }
}

export default startHeartbeat;
