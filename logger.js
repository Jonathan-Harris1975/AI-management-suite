// #logger.js – Final Stable Version
import pino from "pino";

// Pretty-print (same as before)
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

// ---------------------------------------------------------------------
// SAFE WRITE WRAPPER
// Handles ALL signature types without producing "[object Object]"
// ---------------------------------------------------------------------
function write(level, event, data) {
  let evt = event;
  let meta = data;

  // Case 1: info("simple.event")
  if (typeof event === "string" && data === undefined) {
    evt = event;
    meta = {};
  }

  // Case 2: info({ key: "value" }) – old root logger behaviour
  if (typeof event === "object" && event !== null && data === undefined) {
    evt = event.event || "log";
    meta = { ...event };
    delete meta.event;
  }

  // Case 3: Bad patterns produce strings like [object Object]
  if (typeof evt !== "string") {
    evt = String(evt);
  }

  // Ensure meta is safe
  if (typeof meta !== "object" || meta === null) {
    meta = { value: String(meta) };
  }

  instance[level]({ event: evt, ...meta });
}

// ---------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------
export const info = (event, data) => write("info", event, data);
export const warn = (event, data) => write("warn", event, data);
export const error = (event, data) => write("error", event, data);
export const debug = (event, data) => write("debug", event, data);

export default instance;
