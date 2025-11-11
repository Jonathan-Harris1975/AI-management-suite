// ============================================================
// 🌙 keepalive — render/shiper safe, silent, singleton
// ============================================================

import { info } from "#logger.js";

const _ka = globalThis.__KA__ || (globalThis.__KA__ = new Map());

export function startKeepAlive(label = "keepalive", intervalMs = 20000) {
  if (_ka.has(label)) return; // don't double-start
  info({ label, intervalMs }, `🌙 Silent keep-alive active for ${label} (${Math.round(intervalMs/1000)}s interval)`);
  const id = setInterval(() => {
    // tiny heartbeat; avoids runaway log spam
    process.stdout.write(`💤 ${label} alive ${new Date().toISOString()}\n`);
  }, intervalMs);
  _ka.set(label, id);
}

export function stopKeepAlive(label) {
  const id = _ka.get(label);
  if (id) {
    clearInterval(id);
    _ka.delete(label);
    info({ label }, "🌙 Keep-alive stopped.");
  }
}

export default { startKeepAlive, stopKeepAlive };
