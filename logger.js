// #logger.js – Final Stable Version (Time Hidden)
import pino from "pino";

// Pretty-print (no time)
const transport = pino.transport({
  target: "pino-pretty",
  options: {
    colorize: true,
    singleLine: false,
    ignore: "pid,hostname,time", // ensure pretty-printer doesn't show time
  },
});

const instance = pino(
  {
    level: process.env.LOG_LEVEL || "info",
    base: null,
    timestamp: false, // <— completely disable timestamps
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

  if (typeof event === "string" && data === undefined) {
    evt = event;
    meta = {};
  }

  if (typeof event === "object" && event !== null && data === undefined) {
    evt = event.event || "log";
    meta = { ...event };
    delete meta.event;
  }

  if (typeof evt !== "string") {
    evt = String(evt);
  }

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
