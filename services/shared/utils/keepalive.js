import { info ,debug} from "#logger.js";

const KA_MAP = globalThis.__KEEPALIVES__ || (globalThis.__KEEPALIVES__ = new Map());

export function startKeepAlive(label = "keepalive", intervalMs = 20000) {
  if (KA_MAP.has(label)) return;
  
  debug(`⏲️ ${label} started (${Math.round(intervalMs / 1000)}s)`, { label, intervalMs });
  
  let tickCount = 0;
  const ticksPerVisible = Math.floor(180000 / intervalMs); // Show every 3min
  
  const id = setInterval(() => {
    if (++tickCount % ticksPerVisible === 0) {
      info(`⏲️ ${label} running`, { 
        label, 
        uptime: `${Math.round((tickCount * intervalMs) / 60000)}m` 
      });
    }
  }, intervalMs);
  
  KA_MAP.set(label, id);
}

export function stopKeepAlive(label) {
  const id = KA_MAP.get(label);
  if (id) {
    clearInterval(id);
    KA_MAP.delete(label);
    debug(`⏲️ ${label} stopped`, { label });
  }
}

export default { startKeepAlive, stopKeepAlive };
