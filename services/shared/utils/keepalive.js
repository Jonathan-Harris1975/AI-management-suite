// ============================================================
// 🌙 keepalive — Render-safe, silent, global heartbeat manager
// ============================================================

import { info } from "#logger.js";

// Store all intervals in global scope
const KA_MAP = globalThis.__KEEPALIVES__ || (globalThis.__KEEPALIVES__ = new Map());

/**
 * Start a silent keep-alive for a given label.
 * Prevents idle timeout during long ffmpeg or API operations.
 */
export function startKeepAlive(label = "keepalive", intervalMs = 20000) {
  if (KA_MAP.has(label)) return;
  info({ label, intervalMs }, `🌙 Silent keep-alive active for ${label} (${Math.round(intervalMs / 1000)}s interval)`);
  const id = setInterval(() => {
    process.stdout.write(`💤 ${label} alive @ ${new Date().toISOString()}\n`);
  }, intervalMs);
  KA_MAP.set(label, id);
}

/**
 * Stop a running keep-alive by label.
 */
export function stopKeepAlive(label) {
  const id = KA_MAP.get(label);
  if (id) {
    clearInterval(id);
    KA_MAP.delete(label);
    info({ label }, "🌙 Keep-alive stopped.");
  }
}

export default { startKeepAlive, stopKeepAlive };
