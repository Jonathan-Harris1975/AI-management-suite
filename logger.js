// ============================================================
// 🧠 AI Podcast Suite — Ultra-Clean Logger (Pino v8)
// ============================================================
// - Production: minimal JSON (no level/time fields)
// - Development: pretty logs with colours
// - Message-first helper API: info("msg", { meta })
// ============================================================

import pino from "pino";

const isProd =
  process.env.NODE_ENV === "production" || process.env.SHIPER === "true";

let loggerInstance = globalThis.__AI_PODCAST_LOGGER__;

if (!loggerInstance) {
  if (isProd) {
    // Production: structured but minimal
    loggerInstance = pino({
      level: process.env.LOG_LEVEL || "info",
      base: null,          // drop pid/hostname
      timestamp: false,    // drop timestamp field
      formatters: {
        level: () => ({}),     // hide "level"
        bindings: () => ({}),  // hide bindings
        log: (obj) => obj,     // pass through user metadata as-is
      },
      messageKey: "msg",   // ensure message is under "msg"
    });
  } else {
    // Development: pretty, colourised output
    loggerInstance = pino({
      level: process.env.LOG_LEVEL || "debug",
      base: { service: "ai-podcast-suite" },
      timestamp: pino.stdTimeFunctions.isoTime,
      transport: {
        target: "pino-pretty",
        options: {
          colorize: true,
          singleLine: false,
          translateTime: "SYS:standard",
          ignore: "pid,hostname",
          messageKey: "msg",
        },
      },
    });
  }

  globalThis.__AI_PODCAST_LOGGER__ = loggerInstance;
}

const log = loggerInstance;

// ============================================================
// 🔊 PUBLIC LOG WRAPPERS — message-first API
// ============================================================
// Usage:
//   info("Message", { meta });
//   error("Something failed", { err });
// ============================================================
export const info = (msg, obj = {}) => log.info(obj, msg);
export const warn = (msg, obj = {}) => log.warn(obj, msg);
export const error = (msg, obj = {}) => log.error(obj, msg);
export const debug = (msg, obj = {}) => log.debug(obj, msg);

export { log };
export default log;
