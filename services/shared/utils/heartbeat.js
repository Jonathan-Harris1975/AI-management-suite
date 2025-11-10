// ============================================================
// ❤️ Heartbeat Utility — Keeps container alive during long tasks
// ============================================================

import { info } from "#logger.js";

let interval = null;

/**
 * Starts a heartbeat log every N seconds to prevent idle timeout.
 * @param {string} label - Identifier for logs, e.g. "TTS Pipeline"
 * @param {number} intervalSeconds - Interval in SECONDS (default: 120s / 2 minutes)
 */
export function startHeartbeat(label = "Heartbeat", intervalSeconds = 120) {
  stopHeartbeat();
  
  // Safety check: minimum 5 seconds to prevent runaway logs
  const safeInterval = Math.max(intervalSeconds, 5);
  const ms = safeInterval * 1000;
  
  if (intervalSeconds < 5) {
    info({ label }, `⚠️ Heartbeat interval too low (${intervalSeconds}s), using minimum of 5s`);
  }
  
  info({ label }, `💚 Starting heartbeat for ${label} (every ${safeInterval}s)`);
  
  interval = setInterval(() => {
    info({ label, time: new Date().toISOString() }, "♥️ Heartbeat tick");
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
