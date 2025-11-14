// ============================================================																									
// 🌍 AI Podcast Suite — Environment Bootstrap (Shiper-Aligned Final)																									
// ============================================================																									
//																									
// Features:																									
//   • Logs full system snapshot																									
//   • Validates all Shiper environment variables																									
//   • Warns for low system resources																									
//   • Compatible with R2, AWS Polly, and OpenRouter setup																									
// ============================================================																									
																									
"import os from ""os"";"																									
"import process from ""process"";"																									
"import { log } from ""#logger.js"";"																									
																									
// ------------------------------------------------------------------																									
// 🧱 Inline validateEnv()																									
// ------------------------------------------------------------------																									
function validateEnv(requiredKeys = []) {																									
const missing = [];																									
for (const key of requiredKeys) {																									
const val = process.env[key];																									
"if (val === undefined || val === """") missing.push(key);"																									
}																									
																									
if (missing.length > 0) {																									
"log.error(""❌ Missing required environment variables"", { missing });"																									
"log.error(""❌ Missing required environment variables"", { missing });"																									
process.exit(1);																									
}																									
																									
"log.info(""✅ Environment variables validated successfully"", { count: requiredKeys.length });"																									
}																									
																									
// ------------------------------------------------------------------																									
// 🧠 Bootstrap startup diagnostics																									
// ------------------------------------------------------------------																									
"log.info(""============================================="", {});"																									
"log.info(""🧠 AI Podcast Suite - Environment Bootstrap"", {});"																									
"log.info(""============================================="", {});"																									
																									
const systemInfo = {																									
time: new Date().toISOString(),																									
nodeVersion: process.version,																									
platform: os.platform(),																									
arch: os.arch(),																									
cpus: os.cpus()?.length || 1,																									
totalMemGB: (os.totalmem() / 1024 / 1024 / 1024).toFixed(2),																									
freeMemGB: (os.freemem() / 1024 / 1024 / 1024).toFixed(2),																									
"env: process.env.NODE_ENV || ""development"","																									
};																									
																									
"log.info(systemInfo, ""🩺 Startup Health Check"");"																									
																									
// ⚠️ Resource warnings																									
const free = parseFloat(systemInfo.freeMemGB);																									
const cpus = systemInfo.cpus;																									
"if (free < 0.5) log.warn(""Low free memory (<0.5 GB)"", { freeMemGB: systemInfo.freeMemGB });"																									
"if (cpus < 2) log.warn(""Low CPU core count (<2 cores)"", { cpus });"																									
																									
"log.info(""🚀 Beginning environment validation..."", {});"																									
																									
// ------------------------------------------------------------------																									
// ✅ Validate all Shiper environment variables																									
// ------------------------------------------------------------------																									
validateEnv([																									
// Core system																									
"NODE_ENV, ""LOG_LEVEL"", "																									
" ""FEED_URL"", ""MIN_INTRO_DURATION"", ""MIN_OUTRO_DURATION"","																									
																									
																									
// Feed and performance tuning																									
"FEED_FRESHNESS_HOURS, ""FEED_RETENTION_DAYS"","																									
"MAX_FEEDS_PER_RUN, ""MAX_ITEMS_PER_FEED"","																									
"MAX_RSS_FEEDS_PER_RUN, ""MAX_SUMMARY_CHARS"","																									
"MAX_TOTAL_ITEMS, ""MAX_URL_FEEDS_PER_RUN"", ""MIN_SUMMARY_CHARS"","																									
																									
// AI model keys (OpenRouter)																									
"OPENROUTER_API_KEY_CHATGPT, ""OPENROUTER_API_KEY_GOOGLE"","																									
"OPENROUTER_API_KEY_DEEPSEEK, ""OPENROUTER_API_KEY_META"","																									
"OPENROUTER_API_KEY_ART, ""OPENROUTER_API_KEY_ANTHROPIC"","																									
"OPENROUTER_CHATGPT, ""OPENROUTER_GOOGLE"", ""OPENROUTER_DEEPSEEK"","																									
"OPENROUTER_META, ""OPENROUTER_ART"", ""OPENROUTER_ANTHROPIC"","																									
																									
// R2 credentials																									
"R2_ACCESS_KEY_ID, ""R2_SECRET_ACCESS_KEY"", ""R2_ENDPOINT"", ""R2_REGION"","																									
																									
// R2 buckets																									
"R2_BUCKET_PODCAST, ""R2_BUCKET_RAW_TEXT"", ""R2_BUCKET_META"","																									
"R2_BUCKET_MERGED, ""R2_BUCKET_ART"", ""R2_BUCKET_RSS_FEEDS"","																									
"R2_BUCKET_PODCAST_RSS_FEEDS, ""R2_BUCKET_TRANSCRIPTS"","																									
R2_BUCKET_CHUNKS,																									
																									
// R2 public URLs																									
"R2_PUBLIC_BASE_URL_PODCAST, ""R2_PUBLIC_BASE_URL_RAW_TEXT"","																									
"R2_PUBLIC_BASE_URL_META, ""R2_PUBLIC_BASE_URL_MERGE"","																									
"R2_PUBLIC_BASE_URL_ART, ""R2_PUBLIC_BASE_URL_RSS"","																									
"R2_PUBLIC_BASE_URL_PODCAST_RSS, ""R2_PUBLIC_BASE_URL_TRANSCRIPT"","																									
R2_PUBLIC_BASE_URL_CHUNKS,																									
																									
// AWS Polly (TTS)																									
"AWS_ACCESS_KEY_ID, ""AWS_SECRET_ACCESS_KEY"", ""AWS_REGION"", ""POLLY_VOICE_ID"","																									
																									
// Third-party API keys																									
"RAPIDAPI_KEY, ""RAPIDAPI_HOST"","																									
"SHORTIO_API_KEY, ""SHORTIO_DOMAIN"","																									
																									
// Podcast Intro/Outro																									
"PODCAST_INTRO_URL, ""PODCAST_OUTRO_URL"","																									
																									
// RSS feed info																									
"RSS_FEED_TITLE, ""RSS_FEED_DESCRIPTION"","																									
]);																									
																									
// ------------------------------------------------------------------																									
// 🌍 Done																									
// ------------------------------------------------------------------																									
"log.info(""🌍 All environment variables validated successfully."", {});"																									
"log.info(""✅ Environment Bootstrap complete.\n"", {});"																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
																									
