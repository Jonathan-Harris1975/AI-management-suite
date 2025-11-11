// ============================================================
// ❤️ Heartbeat Utility — Safe, throttled version
// ============================================================

import { info } from "#logger.js";

// Track active heartbeats by label
const heartbeats = new Map();

/**
 * Starts a heartbeat log every N seconds (default 30s).
 * Prevents duplicates and runaway intervals.
 *
 * @param {string} label - Identifier for logs, e.g. "ttsProcessor:TT-2025-11-10"
 * @param {number} ms - Interval in milliseconds (default: 30,000)
 */
export function startHeartbeat(label = "Heartbeat", ms = 30000) {
  // If one is already running for this label, stop it first
  stopHeartbeat(label);

  info({ label }, `💓 Starting heartbeat for ${label}`);

  const interval = setInterval(() => {
    info({ label, time: new Date().toISOString() }, "💓 Heartbeat tick");
  }, ms);

  heartbeats.set(label, interval);
}

/**
 * Stops a specific heartbeat or all if no label is provided.
 * @param {string} [label]
 */
export function stopHeartbeat(label) {
  if (label) {
    const interval = heartbeats.get(label);
    if (interval) {
      clearInterval(interval);
      heartbeats.delete(label);
      info({ label }, `🫀 Heartbeat stopped for ${label}`);
    }
  } else {
    // stop all active intervals
    for (const [key, interval] of heartbeats.entries()) {
      clearInterval(interval);
      heartbeats.delete(key);
      info({ label: key }, `🫀 Heartbeat stopped for ${key}`);
    }
  }
}

export default startHeartbeat;
