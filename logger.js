// #logger.js - Human-Friendly Pretty Logger ---------------------------------
import pino from "pino";

// Pretty print transformer
function humanise(data = {}) {
  const newData = { ...data };

  if (newData.bucketsConfigured && typeof newData.bucketsConfigured === "object") {
    const buckets = Object.entries(newData.bucketsConfigured)
      .filter(([_, v]) => v)
      .map(([k]) => k);
    newData.buckets = buckets.join(", ");
    delete newData.bucketsConfigured;
  }

  return newData;
}

// Pretty-print transport
const transport = pino.transport({
  target: "pino-pretty",
  options: {
    colorize: true,
    translateTime: "SYS:standard",
    singleLine: false,
    ignore: "pid,hostname",
  },
});

const instance = pino(
  {
    level: process.env.LOG_LEVEL || "info",
    base: null,
    timestamp: pino.stdTimeFunctions.isoTime,
  },
  transport
);

// ------------------------------------------------------------
// SAFE WRITE WRAPPER (fixes string spreading)
// ------------------------------------------------------------
function write(level, event, data) {
  let evt = event;
  let meta = data;

  // Allow: info("message")
  if (typeof event === "string" && data === undefined) {
    evt = event;
    meta = {};
  }

  // Allow: info({foo:1}) → auto-label as "log"
  if (typeof event === "object" && data === undefined) {
    meta = event;
    evt = "log";
  }

  // Prevent spreading strings
  if (typeof evt !== "string") {
    evt = String(evt);
  }

  // Guarantee data is safe object
  if (typeof meta !== "object" || meta === null || Array.isArray(meta)) {
    meta = { value: meta };
  }

  const cleaned = humanise(meta);

  instance[level](
    {
      event: evt,
      ...cleaned,
    }
  );
}

// ------------------------------------------------------------
// PUBLIC API — fixed signatures
// ------------------------------------------------------------
export const info = (event, data) => write("info", event, data);
export const warn = (event, data) => write("warn", event, data);
export const error = (event, data) => write("error", event, data);
export const debug = (event, data) => write("debug", event, data);

// Backwards compatible .log namespace
export const log = {
  info: (event, data) => write("info", event, data),
  warn: (event, data) => write("warn", event, data),
  error: (event, data) => write("error", event, data),
  debug: (event, data) => write("debug", event, data),
};

export default instance;
