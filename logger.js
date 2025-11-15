// ============================================================
// 🧠 AI Podcast Suite — Ultra-Clean Logger (Pino v8)
// ============================================================

import pino from "pino";

const isProd = process.env.NODE_ENV === "production" || process.env.SHIPER === "true";

let loggerInstance = globalThis.__AI_PODCAST_LOGGER__;

if (!loggerInstance) {
  const customLogFormatters = {
    formatLog: (obj) => {
      const { msg, level, time, ...rest } = obj;
      
      if (isProd) {
        // Production: return only custom fields, no msg
        return rest;
      } else {
        // Development: include message as custom field, exclude msg
        return {
          ...rest,
          // Message is available as custom field if needed
        };
      }
    }
  };

  if (isProd) {
    loggerInstance = pino({
      level: process.env.LOG_LEVEL || "info",
      base: null,
      timestamp: false,
      formatters: {
        level: () => ({}),
        bindings: () => ({}),
        log: customLogFormatters.formatLog,
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
          ignore: "pid,hostname,msg", // Ignore msg in pretty output
          messageKey: "customMessage", // Prevent default msg behavior
        },
      },
      formatters: {
        log: customLogFormatters.formatLog,
      },
    });
  }

  globalThis.__AI_PODCAST_LOGGER__ = loggerInstance;
}

const log = loggerInstance;

// 🔥 WRAPPER FUNCTIONS STAY EXACTLY THE SAME 🔥
export const info = (msg, obj = {}) => log.info(obj, msg);
export const warn = (msg, obj = {}) => log.warn(obj, msg);
export const error = (msg, obj = {}) => log.error(obj, msg);
export const debug = (msg, obj = {}) => log.debug(obj, msg);

export { log };
export default log;
