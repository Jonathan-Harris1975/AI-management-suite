// #logger.js
import pino from "pino";

const instance = pino({
  level: process.env.LOG_LEVEL || "info",
  base: null,               // remove pid / hostname
  timestamp: pino.stdTimeFunctions.isoTime,
});

// Wrap pino so the first argument becomes `event`
// and the second is flattened into the log.
function wrap(level) {
  return (event, data = {}) => {
    instance[level]({
      event,        // 👈 no msg, event only
      ...data       // 👈 flatten extra fields
    });
  };
}

export const info = wrap("info");
export const warn = wrap("warn");
export const error = wrap("error");

export default instance;
