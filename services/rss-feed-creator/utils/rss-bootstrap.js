// services/rss-feed-creator/utils/rss-bootstrap.js
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { info, error } from "#logger.js";
import { getObjectAsText, putText, putJson } from "#shared/r2-client.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const FEEDS_KEY = "rss-feeds.txt";
const URLS_KEY = "url-feeds.txt";
const ROTATION_KEY = "feed-rotation.json";
const DATA_PREFIX = "data/";

/**
 * Local JSON helper for fallback getJson
 */
const getJson = async (bucket, key) => {
  try {
    const txt = await getObjectAsText(bucket, key);
    return txt ? JSON.parse(txt) : null;
  } catch {
    return null;
  }
};

/**
 * ✅ Fully robust local file reader for Render, Koyeb, local dev
 */
async function readLocal(relative) {
  const candidates = [
    path.join(process.cwd(), "services", "rss-feed-creator", "data", relative),
    path.join(process.cwd(), "data", relative),
    path.join(__dirname, "..", "..", "..", "data", relative),
  ];

  for (const filePath of candidates) {
    try {
      const content = await fs.readFile(filePath, "utf8");
      info(`📄 Found local data file: ${filePath}`);
      return content;
    } catch {}
  }

  error(`⚠️ No local data file found for: ${relative}`);
  return null;
}

/**
 * Ensure feeds, urls, and rotation exist in R2
 */
export async function ensureR2Sources() {
  const bucket = process.env.R2_BUCKET_RSS_FEEDS || process.env.R2_BUCKET_PODCAST || "";
  if (!bucket) throw new Error("Missing R2 bucket for RSS data (set R2_BUCKET_RSS_FEEDS).");

  let feedsTxt = await getObjectAsText(bucket, DATA_PREFIX + FEEDS_KEY);
  if (!feedsTxt) {
    feedsTxt = await readLocal(FEEDS_KEY);
    if (feedsTxt) {
      await putText(bucket, DATA_PREFIX + FEEDS_KEY, feedsTxt);
      info("📥 Uploaded local rss-feeds.txt to R2 ✅");
    } else {
      throw new Error("Missing local rss-feeds.txt — unable to bootstrap feeds.");
    }
  }

  let urlsTxt = await getObjectAsText(bucket, DATA_PREFIX + URLS_KEY);
  if (!urlsTxt) {
    urlsTxt = await readLocal(URLS_KEY);
    if (urlsTxt) {
      await putText(bucket, DATA_PREFIX + URLS_KEY, urlsTxt);
      info("📥 Uploaded local url-feeds.txt to R2 ✅");
    } else {
      throw new Error("Missing local url-feeds.txt — unable to bootstrap feeds.");
    }
  }

  const feeds = (feedsTxt || "")
    .split(/\r?\n/)
    .map(s => s.trim())
    .filter(Boolean)
    .map(s => (s.startsWith(DATA_PREFIX) ? s : DATA_PREFIX + s));

  const urls = (urlsTxt || "")
    .split(/\r?\n/)
    .map(s => s.trim())
    .filter(Boolean);

  let rotation = await getJson(bucket, DATA_PREFIX + ROTATION_KEY);
  if (!rotation || typeof rotation.lastIndex !== "number") {
    rotation = { lastIndex: 0 };
    await putJson(bucket, DATA_PREFIX + ROTATION_KEY, rotation);
    info("🔄 Initialized feed rotation at index 0");
  }

  return { bucket, feeds, urls, rotation };
}

/**
 * Save updated rotation index
 */
export async function saveRotation(nextIndex) {
  const bucket = process.env.R2_BUCKET_RSS_FEEDS || process.env.R2_BUCKET_PODCAST || "";
  if (!bucket) throw new Error("Missing R2 bucket for RSS data (set R2_BUCKET_RSS_FEEDS).");
  await putJson(bucket, DATA_PREFIX + ROTATION_KEY, { lastIndex: nextIndex });
  info(`🔁 Saved feed rotation index -> ${nextIndex}`);
