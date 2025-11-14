// ============================================================
// 🧠 AI Podcast Suite — Ultra-Clean Logger (Pino v8)
// ============================================================
// - Production: minimal JSON (no level/time fields)
// - Development: pretty logs with colours
// - Message-first helper API: info("msg", { meta })
// ============================================================

import pino from "pino";

const isProd =
  process.env.NODE_ENV === "production" || process.env.SHIPER === "true";

let loggerInstance = globalThis.__AI_PODCAST_LOGGER__;

if (!loggerInstance) {
  if (isProd) {
    // Production: structured but minimal
    loggerInstance = pino({
      level: process.env.LOG_LEVEL || "info",
      base: null,          // drop pid/hostname
      timestamp: false,    // drop timestamp field
      formatters: {
        level: (label) => ({ severity: label.toUpperCase() }), // Add human-readable severity
        bindings: () => ({}),  // hide bindings
        log: (obj) => {
          // Clean up error objects for better readability
          if (obj.err) {
            return {
              ...obj,
              error: {
                message: obj.err.message,
                type: obj.err.name,
                stack: obj.err.stack?.split('\n').slice(0, 3).join('\n'), // First 3 lines only
              },
            };
          }
          return obj;
        },
      },
      messageKey: "msg",   // ensure message is under "msg"
    });
  } else {
    // Development: pretty, colourised output
    loggerInstance = pino({
      level: process.env.LOG_LEVEL || "debug",
      base: { service: "ai-podcast-suite" },
      timestamp: pino.stdTimeFunctions.isoTime,
      transport: {
        target: "pino-pretty",
        options: {
          colorize: true,
          singleLine: false,
          translateTime: "HH:MM:ss",  // Shorter, friendlier timestamp
          ignore: "pid,hostname",
          messageKey: "msg",
          customPrettifiers: {
            // Make log levels more prominent with emojis
            level: (logLevel) => {
              const icons = {
                10: "🔍 TRACE",
                20: "🐛 DEBUG",
                30: "ℹ️  INFO ",
                40: "⚠️  WARN ",
                50: "❌ ERROR",
                60: "💀 FATAL",
              };
              return icons[logLevel] || logLevel;
            },
          },
          // Add blank lines between log entries for breathing room
          messageFormat: "\n{msg}\n",
        },
      },
    });
  }

  globalThis.__AI_PODCAST_LOGGER__ = loggerInstance;
}

const log = loggerInstance;

// ============================================================
// 🔊 PUBLIC LOG WRAPPERS — message-first API
// ============================================================
// Usage:
//   info("Message", { meta });
//   error("Something failed", { err });
//   success("Task completed", { duration: 123 }); // NEW!
// ============================================================

// Helper to format durations nicely
const formatDuration = (ms) => {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
};

// Enhanced wrappers with better formatting
export const info = (msg, obj = {}) => {
  const enriched = obj.duration ? { ...obj, duration: formatDuration(obj.duration) } : obj;
  log.info(enriched, msg);
};

export const warn = (msg, obj = {}) => log.warn(obj, msg);

export const error = (msg, obj = {}) => {
  // Ensure errors are always formatted nicely
  if (obj.err && !isProd) {
    log.error({ ...obj, err: undefined, error: obj.err.message, stack: obj.err.stack }, msg);
  } else {
    log.error(obj, msg);
  }
};

export const debug = (msg, obj = {}) => log.debug(obj, msg);

// NEW: Success log helper (uses info level but with visual distinction)
export const success = (msg, obj = {}) => {
  const enriched = obj.duration ? { ...obj, duration: formatDuration(obj.duration) } : obj;
  log.info({ ...enriched, success: true }, `✅ ${msg}`);
};

// NEW: Progress/step logger for multi-step operations
export const step = (stepNum, totalSteps, msg, obj = {}) => {
  log.info(obj, `[${stepNum}/${totalSteps}] ${msg}`);
};

export { log };
export default log;
