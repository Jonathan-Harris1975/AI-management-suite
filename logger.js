// ============================================================
// 🧠 AI Podcast Suite — Clean Unified Logger (Pino v8)
// ============================================================
// - Minimal JSON logs in production (no level numbers, no timestamps)
// - Human-readable pretty logs in development
// - Message-first API with emojis
// - No pid, hostname, or unnecessary metadata
// ============================================================

import pino from "pino";

const isProd =
  process.env.NODE_ENV === "production" || process.env.SHIPER === "true";

let loggerInstance = globalThis.__AI_PODCAST_LOGGER__;
if (!loggerInstance) {
  loggerInstance = pino({
    level: process.env.LOG_LEVEL || (isProd ? "info" : "debug"),

    // 🧹 REMOVE noisy fields
    base: null,
    timestamp: false,

    // 🧹 Replace numeric levels with readable labels
    formatters: {
      level(label) {
        return { level: label }; // "info", "warn", "error"
      },
    },

    messageKey: "msg",

    // 💻 Pretty local logs
    transport: !isProd
      ? {
          target: "pino-pretty",
          options: {
            colorize: true,
            ignore: "pid,hostname",
            translateTime: false,
            singleLine: true,
            messageFormat: "{msg}",
          },
        }
      : undefined,
  });

  globalThis.__AI_PODCAST_LOGGER__ = loggerInstance;
}

const log = loggerInstance;

// ============================================================
// 🔊 PUBLIC WRAPPERS — message-first
// ============================================================
export const info = (msg, obj = {}) => log.info(obj, msg);
export const warn = (msg, obj = {}) => log.warn(obj, msg);
export const error = (msg, obj = {}) => log.error(obj, msg);
export const debug = (msg, obj = {}) => log.debug(obj, msg);

export { log };
export default log;
