
// ============================================================
// 🧠 AI Podcast Suite — Final Unified Logger (Non-recursive)
// ============================================================

import pino from "pino";

const isProd =
  process.env.NODE_ENV === "production" || process.env.SHIPER === "true";

let loggerInstance = globalThis.__AI_PODCAST_LOGGER__;
if (!loggerInstance) {
  const baseConfig = {
    level: process.env.LOG_LEVEL || (isProd ? "info" : "debug"),
    base: { service: "ai-podcast-suite" },
  };

  if (isProd) {
    loggerInstance = pino({
      ...baseConfig,
      timestamp: pino.stdTimeFunctions.isoTime,
    });
  } else {
    loggerInstance = pino({
      ...baseConfig,
      transport: {
        target: "pino-pretty",
        options: {
          colorize: true,
          singleLine: true,
          translateTime: "SYS:standard",
          ignore: "pid,hostname",
          messageFormat: "{levelLabel} {msg} {time}",
          customPrettifiers: {
            level: (logLevel) => {
              const emojiMap = {
                60: '🚨',
                50: '❌',
                40: '⚠️',
                30: 'ℹ️',
                20: '🐞',
                10: '🔍',
              };
              return emojiMap[logLevel] || '';
            },
          },
        },
      },
    });
  }

  globalThis.__AI_PODCAST_LOGGER__ = loggerInstance;
}

// ✅ Export single instance — guaranteed non-duplicate
const log = loggerInstance;

export { log };
export const info = (...a) => log.info(...a);
export const warn = (...a) => log.warn(...a);
export const error = (...a) => log.error(...a);
export const debug = (...a) => log.debug(...a);

export default log;
