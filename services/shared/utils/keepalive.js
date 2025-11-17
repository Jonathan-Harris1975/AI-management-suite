// keepalive.js — dynamic silent + periodic status logging
import log from "../../../utils/root-logger.js";

const KA_MAP = globalThis.__KEEPALIVES__ || (globalThis.__KEEPALIVES__ = new Map());

export function startKeepAlive(label = "process", intervalMs = 25000) {
  if (KA_MAP.has(label)) return;

  let counter = 0;

  const id = setInterval(() => {
    counter += 1;

    // Every ~3 minutes (7 * 25s = 175s) log a minimal status message
    if (counter % 7 === 0) {
      log.info("keepalive.status", { process: label });
    }
  }, intervalMs);

  KA_MAP.set(label, id);
}

export function stopKeepAlive(label) {
  const id = KA_MAP.get(label);
  if (id) {
    clearInterval(id);
    KA_MAP.delete(label);
    log.info("keepalive.stopped", { process: label });
  }
}

export default { startKeepAlive, stopKeepAlive };
