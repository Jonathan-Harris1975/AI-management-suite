// #logger.js - Human-Friendly Pretty Logger ---------------------------------
import pino from "pino";

// Pretty print transformer (flatten booleans into lists, short arrays, etc)
function humanise(data = {}) {
  const newData = { ...data };

  // Convert bucketsConfigured object into clean bucket list
  if (newData.bucketsConfigured && typeof newData.bucketsConfigured === "object") {
    const buckets = Object.entries(newData.bucketsConfigured)
      .filter(([_, v]) => v)
      .map(([k]) => k);
    newData.buckets = buckets.join(", ");
    delete newData.bucketsConfigured;
  }

  return newData;
}

// ---------------------------------------------------------------------------
// PRETTY PRINT TRANSPORT (Option B)
// ---------------------------------------------------------------------------
// This makes logs human-readable by default, without needing "pino-pretty"
// in the terminal pipeline.
//
// Supported in Node 20+ (you are on Node 22), completely safe.
// ---------------------------------------------------------------------------

const transport = pino.transport({
  target: "pino-pretty",
  options: {
    colorize: true,
    translateTime: "SYS:standard",
    singleLine: false,
    ignore: "pid,hostname",   // hide useless fields
  },
});

// Create logger with pretty output enabled
const instance = pino(
  {
    level: process.env.LOG_LEVEL || "info",
    base: null, // remove pid + hostname
    timestamp: pino.stdTimeFunctions.isoTime,
  },
  transport
);

// Generic writer used by all exports
function write(level, event, data = {}) {
  const cleaned = humanise(data);
  instance[level]({ event, ...cleaned });
}

// Public logging API
export const info = (event, data = {}) => write("info", event, data);
export const warn = (event, data = {}) => write("warn", event, data);
export const error = (event, data = {}) => write("error", event, data);

// ---------------------------------------------------------------------------
// BACKWARDS COMPATIBILITY FOR SERVICES
// ---------------------------------------------------------------------------
export const log = {
  info: (event, data = {}) => write("info", event, data),
  warn: (event, data = {}) => write("warn", event, data),
  error: (event, data = {}) => write("error", event, data),
};

export default instance;
