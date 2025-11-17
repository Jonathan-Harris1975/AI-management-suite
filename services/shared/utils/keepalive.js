// keepalive.js (updated minimal logging + root-logger)
import log from "../utils/root-logger.js";

const KA_MAP = globalThis.__KEEPALIVES__ || (globalThis.__KEEPALIVES__ = new Map());

export function startKeepAlive(label = "keepalive", intervalMs = 20000) {
  if (KA_MAP.has(label)) return;
  const id = setInterval(() => {}, intervalMs);
  KA_MAP.set(label, id);
}

export function stopKeepAlive(label) {
  const id = KA_MAP.get(label);
  if (id) {
    clearInterval(id);
    KA_MAP.delete(label);
  }
}

export default { startKeepAlive, stopKeepAlive };
