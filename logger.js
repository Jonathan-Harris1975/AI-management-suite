// #logger.js – Ultra-Clean Output with Emoji Message Key
import pino from "pino";

// Pretty-print with no time, no level, no msg labels - using emoji as message key
const transport = pino.transport({
  target: "pino-pretty",
  options: {
    colorize: true,
    singleLine: false,
    ignore: "pid,hostname,time,level",
    messageKey: "🔎", // pino-pretty prints only this emoji-keyed content
  },
});

const instance = pino(
  {
    level: process.env.LOG_LEVEL || "info",
    base: null,
    timestamp: false,
    messageKey: "🔎", // Use emoji as the actual printed field; no label shown
    formatters: {
      level() {
        return {}; // hide level data entirely
      },
    },
  },
  transport
);

// ---------------------------------------------------------------------
// WRITE WRAPPER (emoji message key: 🔎)
// ---------------------------------------------------------------------
function write(level, event, data) {
  let messageContent = "";

  if (typeof event === "string") {
    messageContent = event;
  } else if (typeof event === "object" && event !== null) {
    messageContent = event.message || "";
  } else {
    messageContent = String(event);
  }

  const meta =
    typeof data === "object" && data !== null
      ? data
      : data !== undefined
      ? { value: String(data) }
      : {};

  // pino will print "🔎" content directly with no field name
  instance[level]({ "🔎": messageContent, ...meta });
}

// ---------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------
export const info = (event, data) => write("info", event, data);
export const warn = (event, data) => write("warn", event, data);
export const error = (event, data) => write("error", event, data);
export const debug = (event, data) => write("debug", event, data);

export default instance;
