// utils/root-logger.js
import pino from "pino";

const logger = pino({
  level: process.env.LOG_LEVEL || "info",
  base: null, // no pid/hostname clutter
  timestamp: pino.stdTimeFunctions.isoTime, // ISO time only
});

/**
 * Minimal, emoji-friendly root logger.
 * All logs are flat objects:
 * { "level": 30, "time": "...", "event": "string", ...extra }
 */
function logAt(level, event, data = {}) {
  logger[level]({ event, ...data });
}

const log = {
  info(event, data = {}) {
    logAt("info", event, data);
  },

  warn(event, data = {}) {
    logAt("warn", event, data);
  },

  error(event, data = {}) {
    logAt("error", event, data);
  },

  // Convenience helpers – they just pass the event through,
  // so everything still looks like the RSS logger style.
  startup(event, data = {}) {
    logAt("info", event, data);
  },

  route(event, data = {}) {
    logAt("info", event, data);
  },

  script(event, data = {}) {
    logAt("info", event, data);
  },

  server(event, data = {}) {
    logAt("info", event, data);
  },
};

export default log;
