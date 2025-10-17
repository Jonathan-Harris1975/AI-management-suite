import { log as logger } from "./logger.js";
export async function withRetries(name, fn, tries = 3, delayMs = 2000) {
  let lastErr;
  for (let i=1; i<=tries; i++) {
    try {
      const res = await fn();
      if (i>1) logger.info({ attempt: i, name }, "✅ Succeeded after retry");
      return res;
    } catch (err) {
      lastErr = err;
      logger.warn({ attempt: i, name, err: String(err.message || err) }, "⚠️ Step failed");
      if (i < tries) await new Promise(r => setTimeout(r, delayMs));
    }
  }
  throw lastErr;
}
