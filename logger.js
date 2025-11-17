// #logger.js
// ------------------------------------------------------------
// Global Logger — RSS-Compatible + Backwards-Compatible
// ------------------------------------------------------------
// Supports both:
//    log("event", {...})
// AND
//    log.info("event", {...})
// ------------------------------------------------------------

import pino from "pino";

const instance = pino({
  level: process.env.LOG_LEVEL || "info",
  base: null,
  timestamp: pino.stdTimeFunctions.isoTime,
});

// Internal wrapper: (level, event, data) → flat structured log
function write(level, event, data = {}) {
  instance[level]({ event, ...data });
}

// Exported functions
export const info = (event, data = {}) => write("info", event, data);
export const warn = (event, data = {}) => write("warn", event, data);
export const error = (event, data = {}) => write("error", event, data);

// ------------------------------------------------------------
// Backwards-compatible `log` object used by all services
// ------------------------------------------------------------

export const log = {
  info: (event, data = {}) => write("info", event, data),
  warn: (event, data = {}) => write("warn", event, data),
  error: (event, data = {}) => write("error", event, data),
};

// Also allow direct call: log("event")
export default instance;
