// #logger.js
// ------------------------------------------------------------
// Unified global logger (Root + RSS compatible)
// ------------------------------------------------------------
// - No msg field
// - Flat structured logs
// - Emoji-first event strings supported
// - Services can still use: import { log } from "#logger.js"
// - Root logger & RSS logger both rely on this
// ------------------------------------------------------------

import pino from "pino";

const instance = pino({
  level: process.env.LOG_LEVEL || "info",
  base: null,                                // remove pid/hostname
  timestamp: pino.stdTimeFunctions.isoTime,  // ISO timestamps
});

// Wrapper so:
// info("event", {a:1}) → { "event":"event", "a":1 }
function wrap(level) {
  return (event, data = {}) => {
    instance[level]({ event, ...data });
  };
}

export const info = wrap("info");
export const warn = wrap("warn");
export const error = wrap("error");

// ------------------------------------------------------------
// COMPATIBILITY: legacy "log()" used by services
// ------------------------------------------------------------
// This matches the RSS-logger behaviour exactly.
// ------------------------------------------------------------
export function log(event, data = {}) {
  instance.info({ event, ...data });
}

// By default export the underlying pino instance (not required but kept)
export default instance;
