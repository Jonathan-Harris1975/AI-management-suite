// ============================================================
// 🧠 AI Podcast Suite — Final Unified Logger (Pino)
// ============================================================
//
// - Works in both production (JSON logs) and local dev (pretty logs)
// - Prevents redeclaration errors by using a single export symbol
// - No global collisions or duplicate imports
// - Safe for Shiper, Render, and local dev
// ============================================================

import pino from "pino";

const isProd =
  process.env.NODE_ENV === "production" || process.env.SHIPER === "true";

// 🔒 Global singleton to prevent duplicate instances across imports
let loggerInstance = globalThis.__AI_PODCAST_LOGGER__;
if (!loggerInstance) {
  const baseConfig = {
    level: process.env.LOG_LEVEL || (isProd ? "info" : "debug"),
    base: { service: "ai-podcast-suite" },
  };

  if (isProd) {
    // ✅ JSON logs for production / Shiper
    loggerInstance = pino({
      ...baseConfig,
      timestamp: pino.stdTimeFunctions.isoTime,
    });
  } else {
    // 🧩 Pretty logs for local development
    loggerInstance = pino({
      ...baseConfig,
      transport: {
        target: "pino-pretty",
        options: {
          colorize: true,
          singleLine: true,
          ignore: "pid,hostname",
          translateTime: "SYS:standard",
        },
      },
    });
  }

  globalThis.__AI_PODCAST_LOGGER__ = loggerInstance;
}

// ✅ Consistent singleton export
const log = loggerInstance;

export { log };
export const info = (...args) => log.info(...args);
export const warn = (...args) => log.warn(...args);
export const error = (...args) => log.error(...args);
export const debug = (...args) => log.debug(...args);

export default log;
