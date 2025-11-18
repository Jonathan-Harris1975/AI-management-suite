// #logger.js – Ultra-Clean Output (no msg, no event, no level, no timestamp)
import pino from "pino";

// Pretty-print with no time, no level, no msg labels
const transport = pino.transport({
  target: "pino-pretty",
  options: {
    colorize: true,
    singleLine: false,
    ignore: "pid,hostname,time,level",
    messageKey: "message", // pino-pretty prints only this
  },
});

const instance = pino(
  {
    level: process.env.LOG_LEVEL || "info",
    base: null,
    timestamp: false,
    messageKey: "message", // actual printed field; no label shown
    formatters: {
      level() {
        return {}; // hide level data entirely
      },
    },
  },
  transport
);

// ---------------------------------------------------------------------
// WRITE WRAPPER (no msg: no event: no label:)
// ---------------------------------------------------------------------
function write(level, event, data) {
  let message = "";

  if (typeof event === "string") {
    message = event;
  } else if (typeof event === "object" && event !== null) {
    message = event.message || "";
  } else {
    message = String(event);
  }

  const meta =
    typeof data === "object" && data !== null
      ? data
      : data !== undefined
      ? { value: String(data) }
      : {};

  // pino will print "message" content directly with no field name
  instance[level]({ message, ...meta });
}

// ---------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------
export const info = (event, data) => write("info", event, data);
export const warn = (event, data) => write("warn", event, data);
export const error = (event, data) => write("error", event, data);
export const debug = (event, data) => write("debug", event, data);

export default instance;
