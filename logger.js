/**
 * Centralized logger (ESM) using pino + pino-pretty
 * - Console: pretty, colorized output
 * - Emoji prefixes by level
 * - Optional shipper stub via LOG_SHIP_ENDPOINT (HTTP POST)
 */
import pino from 'pino';

const levelEmoji = {
  fatal: '💥',
  error: '❌',
  warn:  '⚠️',
  info:  'ℹ️',
  debug: '🔍',
  trace: '🧭'
};

// pretty transport only in non-production by default
const isProd = process.env.NODE_ENV === 'production';
const transport = isProd
  ? undefined
  : {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'SYS:standard',
        singleLine: false,
        ignore: 'pid,hostname'
      }
    };

function withEmoji(level, msg) {
  const emoji = levelEmoji[level] || '';
  if (!msg) return emoji;
  return `${emoji} ${msg}`.trim();
}

export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  base: undefined,
  redact: {
    paths: ['password', 'token', 'authorization', 'auth', 'Authorization'],
    remove: true
  },
  transport
});

// Wrap core methods to inject emoji automatically
const core = {
  info: logger.info.bind(logger),
  warn: logger.warn.bind(logger),
  error: logger.error.bind(logger),
  debug: logger.debug.bind(logger),
  trace: logger.trace?.bind(logger) || (()=>{})
};

logger.info = (...args) => core.info(withEmoji('info', args[0]), ...args.slice(1));
logger.warn = (...args) => core.warn(withEmoji('warn', args[0]), ...args.slice(1));
logger.error = (...args) => core.error(withEmoji('error', args[0]), ...args.slice(1));
logger.debug = (...args) => core.debug(withEmoji('debug', args[0]), ...args.slice(1));
logger.trace = (...args) => core.trace(withEmoji('trace', args[0]), ...args.slice(1));

// Optional shipper stub — disabled by default
const shipEndpoint = process.env.LOG_SHIP_ENDPOINT; // e.g., https://logs.example.com/ingest
const shipEnabled = !!shipEndpoint;

export async function shipLog(level, message, meta = {}) {
  if (!shipEnabled) return;
  try {
    const payload = {
      ts: new Date().toISOString(),
      level,
      message,
      meta
    };
    // Node 18+/22+ has global fetch
    const res = await fetch(shipEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      keepalive: true
    });
    if (!res.ok) {
      core.warn('Shipper HTTP non-OK', { status: res.status });
    }
  } catch (err) {
    core.error('Shipper failed', { err: err?.message });
  }
}

// Convenience helpers to ship explicitly
export const ship = {
  info: (msg, meta) => shipLog('info', msg, meta),
  warn: (msg, meta) => shipLog('warn', msg, meta),
  error: (msg, meta) => shipLog('error', msg, meta),
  debug: (msg, meta) => shipLog('debug', msg, meta)
};

export default logger;
