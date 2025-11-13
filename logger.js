// ============================================================
// 🧠 AI Podcast Suite — Ultra-Clean Logger (Pino v8)
// ============================================================
// - Production: ONLY the message (no JSON, no keys)
// - Development: Pretty logs with colours
// - Still supports metadata internally if needed
// ============================================================

import pino from "pino";

const isProd =
  process.env.NODE_ENV === "production" || process.env.SHIPER === "true";

let loggerInstance = globalThis.__AI_PODCAST_LOGGER__;
if (!loggerInstance) {
  loggerInstance = pino({
    level: process.env.LOG_LEVEL || (isProd ? "info" : "debug"),

    // No JSON fields, no timestamps, no pid/hostname
    base: null,
    timestamp: false,

    formatters: {
      level: () => ({}), // hide "level"
      bindings: () => ({}), // hide internal bindings
      log: (obj) => (obj), // pass through only user metadata
    },

    messageKey: "msg",

    // PRODUCTION: Log only the message, nothing else
    transport: isProd
      ? {
          target: "pino-pretty",
          options: {
            colorize: false,
            translateTime: false,
            ignore: "pid,hostname,level,time",
            singleLine: true,
            messageFormat: "{msg}", // ONLY the message itself
          },
        }
      : {
          // DEV: Pretty with colours
          target: "pino-pretty",
          options: {
            colorize: true,
            translateTime: false,
            ignore: "pid,hostname",
            singleLine: true,
            messageFormat: "{msg}",
          },
        },
  });

  globalThis.__AI_PODCAST_LOGGER__ = loggerInstance;
}

const log = loggerInstance;

// ============================================================
// 🔊 PUBLIC LOG WRAPPERS — message-first API
// ============================================================
export const info = (msg, obj = {}) => log.info(obj, msg);
export const warn = (msg, obj = {}) => log.warn(obj, msg);
export const error = (msg, obj = {}) => log.error(obj, msg);
export const debug = (msg, obj = {}) => log.debug(obj, msg);

export { log };
export default log;
