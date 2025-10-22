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
          messageFormat: "{levelLabel} {msg}",
          // ✅ Remove customPrettifiers - they cause DataCloneError
          // Emojis can be added directly in log messages if needed
        },
      },
    });
  }

  globalThis.__AI_PODCAST_LOGGER__ = loggerInstance;
}

// ✅ Consistent singleton export
const log = loggerInstance;

// --- FIXED WRAPPERS ---
// Always put the context object first, then the message string.
// This ensures Pino serialises metadata (message, stack, etc.)
export const info = (msg, obj = {}) => log.info(obj, msg);
export const warn = (msg, obj = {}) => log.warn(obj, msg);
export const error = (msg, obj = {}) => log.error(obj, msg);
export const debug = (msg, obj = {}) => log.debug(obj, msg);

export { log };
export default log;
