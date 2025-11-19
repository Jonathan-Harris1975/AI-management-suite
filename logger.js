// #logger.js – Ultra-Clean Output with Emoji at End of Message
import pino from "pino";

// Pretty-print with no time, no level, no msg labels
const transport = pino.transport({
  target: "pino-pretty",
  options: {
    colorize: true,
    singleLine: false,
    ignore: "pid,hostname,time,level",
    messageKey: "msg", // Changed from "message" to "msg" (pino's default)
  },
});

const instance = pino(
  {
    level: process.env.LOG_LEVEL || "info",
    base: null,
    timestamp: false,
    messageKey: "msg", // Changed from "message" to "msg" (pino's default)
    formatters: {
      level() {
        return {}; // hide level data entirely
      },
    },
  },
  transport
);

// ---------------------------------------------------------------------
// WRITE WRAPPER (emoji appended to message)
// ---------------------------------------------------------------------
function write(level, event, data) {
  let messageContent = "";

  if (typeof event === "string") {
    messageContent = `${event} 🔎`;
  } else if (typeof event === "object" && event !== null) {
    messageContent = `${event.message || ""} 🔎`;
  } else {
    messageContent = `${String(event)} 🔎`;
  }

  const meta =
    typeof data === "object" && data !== null
      ? data
      : data !== undefined
      ? { value: String(data) }
      : {};

  // Use "msg" instead of "message" to match pino's conventions
  instance[level]({ msg: messageContent, ...meta });
}

// ---------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------
export const info = (event, data) => write("info", event, data);
export const warn = (event, data) => write("warn", event, data);
export const error = (event, data) => write("error", event, data);
export const debug = (event, data) => write("debug", event, data);
// Removed the log export as pino doesn't have a "log" level method

export default instance;
