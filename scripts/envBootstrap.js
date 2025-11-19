// ============================================================
// 🌍 Unified Environment Bootstrap
// ============================================================
// Loads, validates, normalises, and exports *all* environment
// variables used across the AI Podcast Suite.
//
// • Warn on missing variables (your preference)
// • Normalise numbers + booleans
// • Clean logging output via #logger.js
// • Provides a single exported `config` object
// ============================================================

import { info, warn , debug} from "#logger.js";

// Helper: convert numeric envs
const toNumber = (value) => {
  if (value === undefined) return undefined;
  const n = Number(value);
  return Number.isNaN(n) ? undefined : n;
};

// Helper: boolean envs ("true", "1", "false", "0")
const toBoolean = (value) => {
  if (value === undefined) return undefined;
  return ["true", "1", "yes"].includes(value.toLowerCase());
};

// === FULL ENV LIST (from your message + confirmations) ======
const ALL_ENV_VARS = [
  "APP_URL",
  "APP_TITLE",
  "FEED_FRESHNESS_HOURS",
  "FEED_RETENTION_DAYS",
  "FEED_URL",
  "FEED_CUTOFF_HOURS",
  "LOG_LEVEL",
  "MAX_FEEDS_PER_RUN",
  "MAX_ITEMS_PER_FEED",
  "MAX_RSS_FEEDS_PER_RUN",
  "MAX_SUMMARY_CHARS",
  "MAX_TOTAL_ITEMS",
  "MAX_URL_FEEDS_PER_RUN",
  "MIN_INTRO_DURATION",
  "MIN_OUTRO_DURATION",
  "MIN_SUMMARY_CHARS",
  "NODE_ENV",

  // OpenRouter — models & API keys
  "OPENROUTER_ANTHROPIC",
  "OPENROUTER_API_KEY_ANTHROPIC",
  "OPENROUTER_API_KEY_ART",
  "OPENROUTER_API_KEY_CHATGPT",
  "OPENROUTER_API_KEY_DEEPSEEK",
  "OPENROUTER_API_KEY_GOOGLE",
  "OPENROUTER_API_KEY_GROK",
  "OPENROUTER_API_KEY_META",
  "OPENROUTER_ART",
  "OPENROUTER_CHATGPT",
  "OPENROUTER_DEEPSEEK",
  "OPENROUTER_GOOGLE",
  "OPENROUTER_META",
  "OPENROUTER_API_BASE",

  // Cloudflare R2
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "R2_REGION",
  "R2_ENDPOINT",

  "R2_BUCKET_ART",
  "R2_BUCKET_CHUNKS",
  "R2_BUCKET_MERGED",
  "R2_BUCKET_META",
  "R2_BUCKET_PODCAST_RSS_FEEDS",
  "R2_BUCKET_PODCAST",
  "R2_BUCKET_RAW_TEXT",
  "R2_BUCKET_RSS_FEEDS",
  "R2_BUCKET_TRANSCRIPTS",
  "R2_BUCKET_EDITED_AUDIO", // (fixed typo)

  "R2_PUBLIC_BASE_URL_ART",
  "R2_PUBLIC_BASE_URL_CHUNKS",
  "R2_PUBLIC_BASE_URL_MERGE",
  "R2_PUBLIC_BASE_URL_META",
  "R2_PUBLIC_BASE_URL_PODCAST_RSS",
  "R2_PUBLIC_BASE_URL_PODCAST",
  "R2_PUBLIC_BASE_URL_RAW_TEXT",
  "R2_PUBLIC_BASE_URL_RSS",
  "R2_PUBLIC_BASE_URL_TRANSCRIPT",
  "R2_PUBLIC_BASE_URL_EDITED_AUDIO", // paired with bucket

  // AWS / Polly
  "AWS_ACCESS_KEY_ID",
  "AWS_SECRET_ACCESS_KEY",
  "AWS_REGION",
  "POLLY_VOICE_ID",
  "MAX_POLLY_NATURAL_CHUNK_CHARS",

  // Podcast + TTS
  "PODCAST_INTRO_URL",
  "PODCAST_OUTRO_URL",
  "TTS_CONCURRENCY",
  "PODCAST_RSS_EP",
  "PODCAST_RSS_ENABLED",

  // AI runtime + retry
  "AI_MAX_RETRIES",
  "AI_MAX_TOKENS",
  "AI_RETRY_BASE_MS",
  "AI_TEMPERATURE",
  "AI_TIMEOUT",
  "AI_TOP_P",

  // Internal networking
  "INTERNAL_BASE_HOST",
  "INTERNAL_BASE_PROTO",

  // Rapid API
  "RAPIDAPI_HOST",
  "RAPIDAPI_KEY",

  // RSS feed metadata
  "RSS_FEED_TITLE",
  "RSS_FEED_DESCRIPTION",

  // Short.io
  "SHORTIO_API_KEY",
  "SHORTIO_DOMAIN",

  // System
  "PORT",
  "SHIPER",

  // Retry tuning for processors
  "MAX_CHUNK_RETRIES",
  "RETRY_DELAY_MS",
  "RETRY_BACKOFF_MULTIPLIER",
];

// ============================================================
// Main bootstrap
// ============================================================
export function validateEnvironment() {
  debug("=============================================");
  debug ("🧠 Environment Bootstrap");
  debug ("=============================================");

  const missing = [];

  for (const key of ALL_ENV_VARS) {
    if (process.env[key] === undefined) {
      missing.push(key);
      warn(`⚠️ Missing env: ${key}`);
    }
  }

  info(` Env scan complete. Total: ${ALL_ENV_VARS.length}, Missing: ${missing.length}`);

  return true; // warn only — no crash
}

// ============================================================
// Structured config export
// ============================================================
export const config = {
  // Strings (direct)
  APP_URL: process.env.APP_URL,
  APP_TITLE: process.env.APP_TITLE,
  FEED_URL: process.env.FEED_URL,
  LOG_LEVEL: process.env.LOG_LEVEL,
  NODE_ENV: process.env.NODE_ENV,
  POLLY_VOICE_ID: process.env.POLLY_VOICE_ID,
  INTERNAL_BASE_HOST: process.env.INTERNAL_BASE_HOST,
  INTERNAL_BASE_PROTO: process.env.INTERNAL_BASE_PROTO,
  SHORTIO_API_KEY: process.env.SHORTIO_API_KEY,
  SHORTIO_DOMAIN: process.env.SHORTIO_DOMAIN,
  RSS_FEED_TITLE: process.env.RSS_FEED_TITLE,
  RSS_FEED_DESCRIPTION: process.env.RSS_FEED_DESCRIPTION,

  // Numbers converted
  FEED_FRESHNESS_HOURS: toNumber(process.env.FEED_FRESHNESS_HOURS),
  FEED_RETENTION_DAYS: toNumber(process.env.FEED_RETENTION_DAYS),
  FEED_CUTOFF_HOURS: toNumber(process.env.FEED_CUTOFF_HOURS),
  MAX_FEEDS_PER_RUN: toNumber(process.env.MAX_FEEDS_PER_RUN),
  MAX_ITEMS_PER_FEED: toNumber(process.env.MAX_ITEMS_PER_FEED),
  MAX_RSS_FEEDS_PER_RUN: toNumber(process.env.MAX_RSS_FEEDS_PER_RUN),
  MAX_SUMMARY_CHARS: toNumber(process.env.MAX_SUMMARY_CHARS),
  MAX_TOTAL_ITEMS: toNumber(process.env.MAX_TOTAL_ITEMS),
  MAX_URL_FEEDS_PER_RUN: toNumber(process.env.MAX_URL_FEEDS_PER_RUN),
  MIN_INTRO_DURATION: toNumber(process.env.MIN_INTRO_DURATION),
  MIN_OUTRO_DURATION: toNumber(process.env.MIN_OUTRO_DURATION),
  MIN_SUMMARY_CHARS: toNumber(process.env.MIN_SUMMARY_CHARS),
  PORT: toNumber(process.env.PORT),

  // AI tuning
  AI_MAX_RETRIES: toNumber(process.env.AI_MAX_RETRIES),
  AI_MAX_TOKENS: toNumber(process.env.AI_MAX_TOKENS),
  AI_RETRY_BASE_MS: toNumber(process.env.AI_RETRY_BASE_MS),
  AI_TEMPERATURE: toNumber(process.env.AI_TEMPERATURE),
  AI_TIMEOUT: toNumber(process.env.AI_TIMEOUT),
  AI_TOP_P: toNumber(process.env.AI_TOP_P),

  // Booleans
  PODCAST_RSS_ENABLED: toBoolean(process.env.PODCAST_RSS_ENABLED),

  // TTS
  TTS_CONCURRENCY: toNumber(process.env.TTS_CONCURRENCY),
  MAX_POLLY_NATURAL_CHUNK_CHARS: toNumber(process.env.MAX_POLLY_NATURAL_CHUNK_CHARS),

  // R2 (buckets + URLs)
  R2: {
    ACCESS_KEY_ID: process.env.R2_ACCESS_KEY_ID,
    SECRET_ACCESS_KEY: process.env.R2_SECRET_ACCESS_KEY,
    REGION: process.env.R2_REGION,
    ENDPOINT: process.env.R2_ENDPOINT,

    BUCKETS: {
      ART: process.env.R2_BUCKET_ART,
      CHUNKS: process.env.R2_BUCKET_CHUNKS,
      MERGED: process.env.R2_BUCKET_MERGED,
      META: process.env.R2_BUCKET_META,
      PODCAST_RSS_FEEDS: process.env.R2_BUCKET_PODCAST_RSS_FEEDS,
      PODCAST: process.env.R2_BUCKET_PODCAST,
      RAW_TEXT: process.env.R2_BUCKET_RAW_TEXT,
      RSS_FEEDS: process.env.R2_BUCKET_RSS_FEEDS,
      TRANSCRIPTS: process.env.R2_BUCKET_TRANSCRIPTS,
      EDITED_AUDIO: process.env.R2_BUCKET_EDITED_AUDIO,
    },

    PUBLIC: {
      ART: process.env.R2_PUBLIC_BASE_URL_ART,
      CHUNKS: process.env.R2_PUBLIC_BASE_URL_CHUNKS,
      MERGE: process.env.R2_PUBLIC_BASE_URL_MERGE,
      META: process.env.R2_PUBLIC_BASE_URL_META,
      PODCAST_RSS: process.env.R2_PUBLIC_BASE_URL_PODCAST_RSS,
      PODCAST: process.env.R2_PUBLIC_BASE_URL_PODCAST,
      RAW_TEXT: process.env.R2_PUBLIC_BASE_URL_RAW_TEXT,
      RSS: process.env.R2_PUBLIC_BASE_URL_RSS,
      TRANSCRIPT: process.env.R2_PUBLIC_BASE_URL_TRANSCRIPT,
      EDITED_AUDIO: process.env.R2_PUBLIC_BASE_URL_EDITED_AUDIO,
    },
  },

  // AWS
  AWS: {
    ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID,
    SECRET_ACCESS_KEY: process.env.AWS_SECRET_ACCESS_KEY,
    REGION: process.env.AWS_REGION,
  },

  // Podcast media
  PODCAST_INTRO_URL: process.env.PODCAST_INTRO_URL,
  PODCAST_OUTRO_URL: process.env.PODCAST_OUTRO_URL,

  // OpenRouter
  OPENROUTER: {
    API_BASE: process.env.OPENROUTER_API_BASE,
    MODELS: {
      ANTHROPIC: process.env.OPENROUTER_ANTHROPIC,
      CHATGPT: process.env.OPENROUTER_CHATGPT,
      GOOGLE: process.env.OPENROUTER_GOOGLE,
      DEEPSEEK: process.env.OPENROUTER_DEEPSEEK,
      META: process.env.OPENROUTER_META,
      ART: process.env.OPENROUTER_ART,
      
    },
    KEYS: {
      ANTHROPIC: process.env.OPENROUTER_API_KEY_ANTHROPIC,
      CHATGPT: process.env.OPENROUTER_API_KEY_CHATGPT,
      GOOGLE: process.env.OPENROUTER_API_KEY_GOOGLE,
      DEEPSEEK: process.env.OPENROUTER_API_KEY_DEEPSEEK,
      META: process.env.OPENROUTER_API_KEY_META,
      ART: process.env.OPENROUTER_API_KEY_ART,
      
    },
  },

  RAPIDAPI_HOST: process.env.RAPIDAPI_HOST,
  RAPIDAPI_KEY: process.env.RAPIDAPI_KEY,

  // Retry tuning
  MAX_CHUNK_RETRIES: toNumber(process.env.MAX_CHUNK_RETRIES),
  RETRY_DELAY_MS: toNumber(process.env.RETRY_DELAY_MS),
  RETRY_BACKOFF_MULTIPLIER: toNumber(process.env.RETRY_BACKOFF_MULTIPLIER),

  SHIPER: process.env.SHIPER,
};

// Default export
export default validateEnvironment;																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
