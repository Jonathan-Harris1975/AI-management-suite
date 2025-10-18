
///envBootstrap.js
import os from "os";
import process from "process";
import { validateEnv } from "../utils/envChecker.js";
import { log } from "../utils/logger.js";

log.info({}, "=============================================");
log.info({}, "🧠 AI Podcast Suite - Environment Bootstrap");
log.info({}, "=============================================");

const systemInfo = {
  time: new Date().toISOString(),
  nodeVersion: process.version,
  platform: os.platform(),
  arch: os.arch(),
  cpus: os.cpus()?.length || 1,
  totalMemGB: (os.totalmem() / 1024 / 1024 / 1024).toFixed(2),
  freeMemGB: (os.freemem() / 1024 / 1024 / 1024).toFixed(2),
  env: process.env.NODE_ENV || "development",
};

log.info(systemInfo, "🩺 Startup Health Check");

// ⚠️ Warnings
const free = parseFloat(systemInfo.freeMemGB);
const cpus = systemInfo.cpus;
if (free < 0.5) log.warn({ freeMemGB: systemInfo.freeMemGB }, "Low free memory (<0.5 GB)");
if (cpus < 2) log.warn({ cpus }, "Low CPU core count (<2 cores)");

log.info({}, "🚀 Beginning environment validation...");

// Validate environment variables
validateEnv([
  "NODE_ENV", "LOG_LEVEL", "DISABLE_RSS", "DISABLE_PODCAST",
  "DISABLE_REWRITE", "HEARTBEAT_ENABLE", "FEED_URL",
  "MIN_INTRO_DURATION", "MIN_OUTRO_DURATION",
  "OPENROUTER_API_KEY", "OPENROUTER_API_KEY_CHATGPT", "OPENROUTER_API_KEY_GOOGLE",
  "OPENROUTER_API_KEY_DEEPSEEK", "OPENROUTER_API_KEY_META", 
  "OPENROUTER_API_KEY_ART", "OPENROUTER_API_KEY_ANTHROPIC",
  "OPENROUTER_CHATGPT", "OPENROUTER_GOOGLE", "OPENROUTER_DEEPSEEK", "OPENROUTER_META",
 "OPENROUTER_ART", "OPENROUTER_ANTHROPIC",
  "GEMINI_API_KEY",  "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_ENDPOINT", "R2_REGION",
  "R2_BUCKET_PODCAST", "R2_BUCKET_RAW", "R2_BUCKET_RAW_TEXT", "R2_BUCKET_META",
  "R2_BUCKET_MERGED", "R2_BUCKET_ART", "R2_BUCKET_PODCAST_RSS_FEEDS",
  "R2_BUCKET_RSS_FEEDS", "R2_BUCKET_TRANSCRIPTS",
  "R2_PUBLIC_BASE_URL_PODCAST", "R2_PUBLIC_BASE_URL_RAW", "R2_PUBLIC_BASE_URL_RAW_TEXT",
  "R2_PUBLIC_BASE_URL_META", "R2_PUBLIC_BASE_URL_MERGE", "R2_PUBLIC_BASE_URL_ART",
  "R2_PUBLIC_BASE_URL_PODCAST_RSS", "R2_PUBLIC_BASE_URL_RSS",
  "R2_PUBLIC_BASE_URL_TRANSCRIPT", "R2_PUBLIC_BASE_URL_CHUNKS",
  "SHORTIO_API_KEY", "SHORTIO_DOMAIN", "RAPIDAPI_KEY", "RAPIDAPI_HOST",
  "RSS_FEED_TITLE", "RSS_FEED_DESCRIPTION"
]);

log.info({}, "🌍 All environment variables validated successfully.");
log.info({}, "✅ Environment Bootstrap complete.\n");
