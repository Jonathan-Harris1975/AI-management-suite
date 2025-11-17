// scripts/envBootstrap.js
// ------------------------------------------------------------
// Unified Environment Bootstrap (Clean Logging Version)
// ------------------------------------------------------------
// - Validates environment variables (warn-only)
// - Normalises numbers + booleans
// - Exports full structured configuration
// - Uses root-level logger (minimal output)
// ------------------------------------------------------------

import log from "#shared/utils/root-logger.js";

// -------------------------------
// Helpers
// -------------------------------
const toNumber = (value) => {
  if (value == null) return undefined;
  const n = Number(value);
  return Number.isNaN(n) ? undefined : n;
};

const toBoolean = (value) => {
  if (value == null) return undefined;
  return ["true", "1", "yes"].includes(value.toLowerCase());
};

// -------------------------------
// Full environment key list
// -------------------------------
const ALL_ENV_VARS = [
  // Core
  "APP_URL",
  "APP_TITLE",
  "FEED_URL",
  "FEED_FRESHNESS_HOURS",
  "FEED_RETENTION_DAYS",
  "FEED_CUTOFF_HOURS",
  "LOG_LEVEL",
  "NODE_ENV",
  "PORT",

  // AI tuning
  "MAX_SUMMARY_CHARS",
  "MIN_SUMMARY_CHARS",
  "MAX_TOTAL_ITEMS",

  // Feed processing
  "MAX_ITEMS_PER_FEED",
  "MAX_FEEDS_PER_RUN",
  "MAX_RSS_FEEDS_PER_RUN",
  "MAX_URL_FEEDS_PER_RUN",
  "MIN_INTRO_DURATION",
  "MIN_OUTRO_DURATION",

  // OpenRouter Models
  "OPENROUTER_API_BASE",
  "OPENROUTER_CHATGPT",
  "OPENROUTER_META",
  "OPENROUTER_GOOGLE",
  "OPENROUTER_DEEPSEEK",
  "OPENROUTER_ANTHROPIC",
  "OPENROUTER_ART",

  // OpenRouter API Keys
  "OPENROUTER_API_KEY_CHATGPT",
  "OPENROUTER_API_KEY_META",
  "OPENROUTER_API_KEY_GOOGLE",
  "OPENROUTER_API_KEY_DEEPSEEK",
  "OPENROUTER_API_KEY_ANTHROPIC",
  "OPENROUTER_API_KEY_ART",

  // Cloudflare R2 Core
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "R2_REGION",
  "R2_ENDPOINT",

  // Cloudflare R2 Buckets
  "R2_BUCKET_ART",
  "R2_BUCKET_CHUNKS",
  "R2_BUCKET_MERGED",
  "R2_BUCKET_META",
  "R2_BUCKET_PODCAST",
  "R2_BUCKET_PODCAST_RSS_FEEDS",
  "R2_BUCKET_RAW_TEXT",
  "R2_BUCKET_RSS_FEEDS",
  "R2_BUCKET_TRANSCRIPTS",
  "R2_BUCKET_EDITED_AUDIO",

  // Cloudflare R2 Public URLs
  "R2_PUBLIC_BASE_URL_ART",
  "R2_PUBLIC_BASE_URL_CHUNKS",
  "R2_PUBLIC_BASE_URL_MERGE",
  "R2_PUBLIC_BASE_URL_META",
  "R2_PUBLIC_BASE_URL_PODCAST",
  "R2_PUBLIC_BASE_URL_PODCAST_RSS",
  "R2_PUBLIC_BASE_URL_RAW_TEXT",
  "R2_PUBLIC_BASE_URL_RSS",
  "R2_PUBLIC_BASE_URL_TRANSCRIPT",
  "R2_PUBLIC_BASE_URL_EDITED_AUDIO",

  // AWS / Polly
  "AWS_ACCESS_KEY_ID",
  "AWS_SECRET_ACCESS_KEY",
  "AWS_REGION",
  "POLLY_VOICE_ID",
  "MAX_POLLY_NATURAL_CHUNK_CHARS",

  // TTS + Podcast
  "TTS_CONCURRENCY",
  "PODCAST_INTRO_URL",
  "PODCAST_OUTRO_URL",
  "PODCAST_RSS_EP",
  "PODCAST_RSS_ENABLED",

  // AI Runtime
  "AI_MAX_RETRIES",
  "AI_MAX_TOKENS",
  "AI_RETRY_BASE_MS",
  "AI_TEMPERATURE",
  "AI_TIMEOUT",
  "AI_TOP_P",

  // Networking
  "INTERNAL_BASE_HOST",
  "INTERNAL_BASE_PROTO",

  // RapidAPI
  "RAPIDAPI_HOST",
  "RAPIDAPI_KEY",

  // RSS Metadata
  "RSS_FEED_TITLE",
  "RSS_FEED_DESCRIPTION",

  // Short.io
  "SHORTIO_API_KEY",
  "SHORTIO_DOMAIN",

  // Retry tuning
  "MAX_CHUNK_RETRIES",
  "RETRY_DELAY_MS",
  "RETRY_BACKOFF_MULTIPLIER",

  // Shiper (deployment platform)
  "SHIPER",
];

// -------------------------------
// Main validator
// -------------------------------
export function validateEnvironment() {
  const missing = [];

  for (const key of ALL_ENV_VARS) {
    if (process.env[key] === undefined) {
      missing.push(key);
    }
  }

  log.script("envBootstrap", "scan", {
    total: ALL_ENV_VARS.length,
    missing: missing.length,
  });

  if (missing.length > 0) {
    log.script("envBootstrap", "missing", { keys: missing });
  }

  return true; // warn only (your preference)
}

// -------------------------------
// Structured config export
// -------------------------------
export const config = {
  APP_URL: process.env.APP_URL,
  APP_TITLE: process.env.APP_TITLE,
  FEED_URL: process.env.FEED_URL,
  LOG_LEVEL: process.env.LOG_LEVEL,
  NODE_ENV: process.env.NODE_ENV,

  FEED_FRESHNESS_HOURS: toNumber(process.env.FEED_FRESHNESS_HOURS),
  FEED_RETENTION_DAYS: toNumber(process.env.FEED_RETENTION_DAYS),
  FEED_CUTOFF_HOURS: toNumber(process.env.FEED_CUTOFF_HOURS),

  MAX_FEEDS_PER_RUN: toNumber(process.env.MAX_FEEDS_PER_RUN),
  MAX_ITEMS_PER_FEED: toNumber(process.env.MAX_ITEMS_PER_FEED),
  MAX_RSS_FEEDS_PER_RUN: toNumber(process.env.MAX_RSS_FEEDS_PER_RUN),
  MAX_URL_FEEDS_PER_RUN: toNumber(process.env.MAX_URL_FEEDS_PER_RUN),
  MAX_SUMMARY_CHARS: toNumber(process.env.MAX_SUMMARY_CHARS),
  MIN_SUMMARY_CHARS: toNumber(process.env.MIN_SUMMARY_CHARS),
  MAX_TOTAL_ITEMS: toNumber(process.env.MAX_TOTAL_ITEMS),
  MIN_INTRO_DURATION: toNumber(process.env.MIN_INTRO_DURATION),
  MIN_OUTRO_DURATION: toNumber(process.env.MIN_OUTRO_DURATION),

  PORT: toNumber(process.env.PORT),

  // AI parameters
  AI_MAX_RETRIES: toNumber(process.env.AI_MAX_RETRIES),
  AI_MAX_TOKENS: toNumber(process.env.AI_MAX_TOKENS),
  AI_RETRY_BASE_MS: toNumber(process.env.AI_RETRY_BASE_MS),
  AI_TEMPERATURE: toNumber(process.env.AI_TEMPERATURE),
  AI_TIMEOUT: toNumber(process.env.AI_TIMEOUT),
  AI_TOP_P: toNumber(process.env.AI_TOP_P),

  // Feature toggles
  PODCAST_RSS_ENABLED: toBoolean(process.env.PODCAST_RSS_ENABLED),

  // AWS
  AWS: {
    ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID,
    SECRET_ACCESS_KEY: process.env.AWS_SECRET_ACCESS_KEY,
    REGION: process.env.AWS_REGION,
  },

  // OpenRouter
  OPENROUTER: {
    API_BASE: process.env.OPENROUTER_API_BASE,
    MODELS: {
      CHATGPT: process.env.OPENROUTER_CHATGPT,
      META: process.env.OPENROUTER_META,
      GOOGLE: process.env.OPENROUTER_GOOGLE,
      DEEPSEEK: process.env.OPENROUTER_DEEPSEEK,
      ANTHROPIC: process.env.OPENROUTER_ANTHROPIC,
      ART: process.env.OPENROUTER_ART,
    },
    KEYS: {
      CHATGPT: process.env.OPENROUTER_API_KEY_CHATGPT,
      META: process.env.OPENROUTER_API_KEY_META,
      GOOGLE: process.env.OPENROUTER_API_KEY_GOOGLE,
      DEEPSEEK: process.env.OPENROUTER_API_KEY_DEEPSEEK,
      ANTHROPIC: process.env.OPENROUTER_API_KEY_ANTHROPIC,
      ART: process.env.OPENROUTER_API_KEY_ART,
    },
  },

  // R2
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
      PODCAST: process.env.R2_BUCKET_PODCAST,
      PODCAST_RSS_FEEDS: process.env.R2_BUCKET_PODCAST_RSS_FEEDS,
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
      PODCAST: process.env.R2_PUBLIC_BASE_URL_PODCAST,
      PODCAST_RSS: process.env.R2_PUBLIC_BASE_URL_PODCAST_RSS,
      RAW_TEXT: process.env.R2_PUBLIC_BASE_URL_RAW_TEXT,
      RSS: process.env.R2_PUBLIC_BASE_URL_RSS,
      TRANSCRIPT: process.env.R2_PUBLIC_BASE_URL_TRANSCRIPT,
      EDITED_AUDIO: process.env.R2_PUBLIC_BASE_URL_EDITED_AUDIO,
    },
  },

  // Podcast media
  PODCAST_INTRO_URL: process.env.PODCAST_INTRO_URL,
  PODCAST_OUTRO_URL: process.env.PODCAST_OUTRO_URL,

  // TTS
  TTS_CONCURRENCY: toNumber(process.env.TTS_CONCURRENCY),
  MAX_POLLY_NATURAL_CHUNK_CHARS: toNumber(
    process.env.MAX_POLLY_NATURAL_CHUNK_CHARS
  ),

  // RapidAPI
  RAPIDAPI_HOST: process.env.RAPIDAPI_HOST,
  RAPIDAPI_KEY: process.env.RAPIDAPI_KEY,

  // Short.io
  SHORTIO_API_KEY: process.env.SHORTIO_API_KEY,
  SHORTIO_DOMAIN: process.env.SHORTIO_DOMAIN,

  // Retry tuning
  MAX_CHUNK_RETRIES: toNumber(process.env.MAX_CHUNK_RETRIES),
  RETRY_DELAY_MS: toNumber(process.env.RETRY_DELAY_MS),
  RETRY_BACKOFF_MULTIPLIER: toNumber(
    process.env.RETRY_BACKOFF_MULTIPLIER
  ),

  SHIPER: process.env.SHIPER,
};

export default validateEnvironment;																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
