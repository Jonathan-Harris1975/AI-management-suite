// #logger.js - Human-Friendly Edition --------------------------------------
import pino from "pino";

// Pretty print transformer (flatten booleans into lists, short arrays, etc)
function humanise(data = {}) {
  const newData = { ...data };

  // If a bucketsConfigured object exists, convert it to a readable list
  if (newData.bucketsConfigured && typeof newData.bucketsConfigured === "object") {
    const buckets = Object.entries(newData.bucketsConfigured)
      .filter(([_, v]) => v)
      .map(([k]) => k);

    newData.buckets = buckets.join(", ");
    delete newData.bucketsConfigured;
  }

  return newData;
}

const instance = pino({
  level: process.env.LOG_LEVEL || "info",
  base: null,
  timestamp: pino.stdTimeFunctions.isoTime
});

function write(level, event, data = {}) {
  const cleaned = humanise(data);
  instance[level]({ event, ...cleaned });
}

export const info = (event, data = {}) => write("info", event, data);
export const warn = (event, data = {}) => write("warn", event, data);
export const error = (event, data = {}) => write("error", event, data);

// BACKWARDS COMPATIBILITY ---------------------------------------
export const log = {
  info: (event, data = {}) => write("info", event, data),
  warn: (event, data = {}) => write("warn", event, data),
  error: (event, data = {}) => write("error", event, data),
};

export default instance;
