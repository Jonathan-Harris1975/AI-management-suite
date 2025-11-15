// ============================================================
// AI Podcast Suite — Modern Minimal Logger
// ============================================================
// - Production: structured JSON logs
// - Development: human-readable output
// - Clean, message-first API
// ============================================================

import pino from "pino";

// Configuration
const isProd = process.env.NODE_ENV === "production";
const logLevel = process.env.LOG_LEVEL || (isProd ? "info" : "debug");

// Singleton logger instance
let loggerInstance = globalThis.__AI_PODCAST_LOGGER__;

if (!loggerInstance) {
  const baseConfig = {
    level: logLevel,
    messageKey: "message",
    base: null, // Remove default fields
  };

  if (isProd) {
    // Production: clean JSON structure
    loggerInstance = pino({
      ...baseConfig,
      formatters: {
        level: (label) => ({ level: label.toUpperCase() }),
        bindings: () => ({}),
      },
      timestamp: () => `,"timestamp":"${new Date().toISOString()}"`,
    });
  } else {
    // Development: readable output
    loggerInstance = pino({
      ...baseConfig,
      transport: {
        target: "pino-pretty",
        options: {
          colorize: true,
          ignore: "pid,hostname",
          translateTime: "HH:MM:ss",
          messageKey: "message",
        },
      },
    });
  }

  globalThis.__AI_PODCAST_LOGGER__ = loggerInstance;
}

// Core logger
const log = loggerInstance;

// ============================================================
// Logging API
// ============================================================

// Format duration for readability
const formatDuration = (ms: number): string => {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
};

// Enhanced error handling
const formatError = (error: unknown) => {
  if (error instanceof Error) {
    return {
      message: error.message,
      name: error.name,
      stack: error.stack,
    };
  }
  return { value: error };
};

// Main log methods
export const info = (message: string, meta?: Record<string, unknown>) => {
  const enriched = meta?.duration ? 
    { ...meta, duration: formatDuration(meta.duration as number) } : meta;
  log.info(enriched, message);
};

export const warn = (message: string, meta?: Record<string, unknown>) => {
  log.warn(meta, message);
};

export const error = (message: string, meta?: Record<string, unknown>) => {
  const formattedMeta = meta?.error ? 
    { ...meta, error: formatError(meta.error) } : meta;
  log.error(formattedMeta, message);
};

export const debug = (message: string, meta?: Record<string, unknown>) => {
  log.debug(meta, message);
};

// Specialized loggers
export const success = (message: string, meta?: Record<string, unknown>) => {
  const enriched = meta?.duration ? 
    { ...meta, duration: formatDuration(meta.duration as number) } : meta;
  log.info({ ...enriched, success: true }, message);
};

export const step = (current: number, total: number, message: string, meta?: Record<string, unknown>) => {
  log.info({ ...meta, step: `${current}/${total}` }, message);
};

export { log };
export default log;
