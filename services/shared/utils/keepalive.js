// ============================================================
// 🌙 keepalive — shiper-safe, silent, global heartbeat manager
// ============================================================

import { info } from "#logger.js";

// Store all intervals in global scope
const KA_MAP = globalThis.__KEEPALIVES__ || (globalThis.__KEEPALIVES__ = new Map());

/**
 * Start a silent keep-alive for a given label.
 * Prevents idle timeout during long ffmpeg or API operations.
 * Shows a visible message every 3 minutes while running silently in background.
 */
export function startKeepAlive(label = "keepalive", intervalMs = 20000) {
  if (KA_MAP.has(label)) return;
  
  info(`⏲️ Keep-alive started for ${label} (${Math.round(intervalMs / 1000)}s interval)`, { label, intervalMs });
  
  let tickCount = 0;
  const visibleInterval = 180000; // 3 minutes in ms
  const ticksPerVisible = Math.floor(visibleInterval / intervalMs);
  
  const id = setInterval(() => {
    tickCount++;
    // Show visible message every 3 minutes
    if (tickCount % ticksPerVisible === 0) {
      info(`⏲️ Keep-alive still running for ${label}`, { 
        label, 
        uptime: `${Math.round((tickCount * intervalMs) / 60000)} minutes` 
      });
    }
    // Silent heartbeat - no console output
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
    info("⏲️ Keep-alive stopped.", { label });
  }
}

export default { startKeepAlive, stopKeepAlive };
