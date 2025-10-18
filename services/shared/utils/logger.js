// ============================================================
// 🧠 Unified Logger for AI Management Suite (Shiper Compatible)
// ============================================================
//
// Guarantees:
//  • Always has a readable string prefix
//  • Always prints JSON context (full detail)
//  • Prevents "undefined" or blank log lines on Shiper
// ============================================================

import pino from "pino";

const base = pino({
  level: process.env.LOG_LEVEL || "info",
  transport:
    process.env.NODE_ENV === "production"
      ? undefined
      : {
          target: "pino-pretty",
          options: { colorize: true, translateTime: "SYS:standard" },
        },
});

function normalize(msg, ctx = {}) {
  let text = "";
  if (typeof msg === "string" && msg.trim().length > 0) text = msg;
  else if (msg && typeof msg === "object") text = JSON.stringify(msg);
  else text = "[no message]";
  return [text, ctx];
}

export function info(msg, ctx = {}) {
  const [text, meta] = normalize(msg, ctx);
  base.info(meta, text);
}

export function warn(msg, ctx = {}) {
  const [text, meta] = normalize(msg, ctx);
  base.warn(meta, text);
}

export function error(msg, ctx = {}) {
  const [text, meta] = normalize(msg, ctx);
  base.error(meta, text);
}

export function debug(msg, ctx = {}) {
  const [text, meta] = normalize(msg, ctx);
  base.debug(meta, text);
}

export const log = { info, warn, error, debug };
export default log;
