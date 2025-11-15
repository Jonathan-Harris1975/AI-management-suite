// ============================================================
// 🧠 AI Podcast Suite — Ultra-Clean Logger (Pino v8)
// ============================================================

import pino from "pino";

const isProd = process.env.NODE_ENV === "production" || process.env.SHIPER === "true";

let loggerInstance = globalThis.__AI_PODCAST_LOGGER__;

if (!loggerInstance) {
  if (isProd) {
    loggerInstance = pino({
      level: process.env.LOG_LEVEL || "info",
      base: null,
      timestamp: false,
      formatters: {
        level: () => ({}),
        bindings: () => ({}),
        log: (obj) => {
          // Production: return only custom fields, exclude msg
          const { msg, ...rest } = obj;
          return rest;
        },
      },
    });
  } else {
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
          ignore: "pid,hostname,msg",
        },
      },
      formatters: {
        log: (obj) => {
          // Development: also exclude msg from output
          const { msg, ...rest } = obj;
          return rest;
        },
      },
    });
  }

  globalThis.__AI_PODCAST_LOGGER__ = loggerInstance;
}

const log = loggerInstance;

// Wrapper functions with proper msg parameter
export const info = (msg, obj = {}) => log.info(obj, msg);
export const warn = (msg, obj = {}) => log.warn(obj, msg);
export const error = (msg, obj = {}) => log.error(obj, msg);
export const debug = (msg, obj = {}) => log.debug(obj, msg);

export { log };
export default log;
