// #logger.js – Minimal Clean Output
import pino from "pino";

// Pretty-print with no labels, no level, no timestamps
const transport = pino.transport({
  target: "pino-pretty",
  options: {
    colorize: true,
    singleLine: false,
    ignore: "pid,hostname,time,level,event,label", // hide everything
    messageKey: "msg", // only output this
  },
});

// Logger base: no meta, no timestamp, no level in output
const instance = pino(
  {
    level: process.env.LOG_LEVEL || "info",
    base: null,
    timestamp: false,
    formatters: {
      level() {
        return {}; // removes "level": "info"
      },
    },
    messageKey: "msg",
  },
  transport
);

// ---------------------------------------------------------------------
// CLEAN WRITE WRAPPER (no event, no label, clean msg only)
// ---------------------------------------------------------------------
function write(level, event, data) {
  let msg = "";

  // string only
  if (typeof event === "string") {
    msg = event;
  }

  // object only
  else if (typeof event === "object" && event !== null) {
    msg = event.msg || "";
  }

  // fallback
  else {
    msg = String(event);
  }

  // attach meta data but without event/label/etc.
  const meta = typeof data === "object" && data !== null ? data : {};

  instance[level]({ msg, ...meta });
}

// ---------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------
export const info  = (event, data) => write("info", event, data);
export const warn  = (event, data) => write("warn", event, data);
export const error = (event, data) => write("error", event, data);
export const debug = (event, data) => write("debug", event, data);

export default instance;
