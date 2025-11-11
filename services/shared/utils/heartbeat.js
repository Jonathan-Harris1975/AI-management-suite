// ============================================================
// ❤️ Robust Heartbeat Utility — Keeps container alive reliably
// ============================================================

import { info } from "#logger.js";

const HEARTBEAT_KEY = Symbol.for("__app_heartbeat_interval__");

/**
 * Accessor for global heartbeat ID
 */
function getInterval() {
  return globalThis[HEARTBEAT_KEY] || null;
}

function setIntervalId(id) {
  globalThis[HEARTBEAT_KEY] = id;
}

/**
 * Starts a single global heartbeat
 * @param {string} label - Label for log output
 * @param {number} intervalSeconds - Time in seconds (default: 120)
 */
export function startHeartbeat(label = "Heartbeat", intervalSeconds = 120) {
  // Always stop any previous interval before creating a new one
  stopHeartbeat();

  // Clamp to minimum interval (avoid log spam)
  const safeSeconds = Math.max(intervalSeconds, 5);
  const ms = safeSeconds * 1000;

  info({ label }, `💚 Starting heartbeat for "${label}" — every ${safeSeconds}s (${ms}ms)`);

  const intervalId = setInterval(() => {
    info({ label, time: new Date().toISOString() }, "♥️ Heartbeat tick");
  }, ms);

  setIntervalId(intervalId);

  info({ label, intervalId }, `✅ Heartbeat started (interval ID: ${intervalId})`);
}

/**
 * Stops the global heartbeat interval
 */
export function stopHeartbeat() {
  const id = getInterval();
  if (id) {
    clearInterval(id);
    setIntervalId(null);
    info({}, `🛑 Heartbeat stopped (interval ID: ${id})`);
  }
}

/**
 * Ensures heartbeat isn’t accidentally duplicated
 */
export function ensureHeartbeat(label = "Heartbeat", intervalSeconds = 120) {
  if (!getInterval()) {
    startHeartbeat(label, intervalSeconds);
  } else {
    info({ label }, "ℹ️ Heartbeat already running, skipping start");
  }
}

export default startHeartbeat;
