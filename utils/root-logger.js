// services/shared/utils/root-logger.js
import pino from "pino";

const logger = pino({
  level: process.env.LOG_LEVEL || "info",
  base: null, // no pid/hostname clutter
  timestamp: pino.stdTimeFunctions.isoTime, // ISO time only
});

export default {
  info(event, data = {}) {
    logger.info({ event, ...data });
  },

  warn(event, data = {}) {
    logger.warn({ event, ...data });
  },

  error(event, data = {}) {
    logger.error({ event, ...data });
  },

  // High-level startup events (bootstrap, env checks, etc.)
  startup(msg, data = {}) {
    logger.info({ event: "startup", msg, ...data });
  },

  // HTTP routes (all services)
  route(route, msg, data = {}) {
    logger.info({ event: "route", route, msg, ...data });
  },

  // Background workers, processors, scripts
  script(name, msg, data = {}) {
    logger.info({ event: "script", script: name, msg, ...data });
  },

  // Server-level info: listening, health, shutdown
  server(msg, data = {}) {
    logger.info({ event: "server", msg, ...data });
  },
};
