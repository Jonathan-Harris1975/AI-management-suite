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
 * Graceful JSON parser
 */
const getJson = async (bucket, key) => {
  try {
    const txt = await getObjectAsText(bucket, key);
    return txt ? JSON.parse(txt) : null;
  } catch (err) {
    error(`⚠️ Failed to parse JSON from ${key}: ${err.message}`);
    return null;
  }
};

/**
 * ✅ Universal file locator for Render, Shiper, and local
 */
async function readLocal(relative) {
  const candidates = [
    path.join("/app/src/services/rss-feed-creator/data", relative),
    path.join("/opt/render/project/src/services/rss-feed-creator/data", relative),
    path.join("/app/services/rss-feed-creator/data", relative),
    path.join(process.cwd(), "services", "rss-feed-creator", "data", relative),
    path.join(__dirname, "..", "data", relative),
  ];

  for (const candidate of candidates) {
    try {
      const txt = await fs.readFile(candidate, "utf8");
      info(`📄 Found local data file: ${candidate}`);
      return txt;
    } catch {
      // continue to next candidate
    }
  }

  error(`❌ Local data file not found for ${relative}`);
  return null;
}

/**
 * Ensures the feeds, urls, and rotation data exist in R2
 */
export async function ensureR2Sources() {
  const bucket =
    process.env.R2_BUCKET_RSS_FEEDS ||
    process.env.R2_BUCKET_PODCAST ||
    "rss-feeds";

  info(`🪣 Using R2 bucket: ${bucket}`);

  // --- Feeds list ---
  let feedsTxt = await getObjectAsText(bucket, DATA_PREFIX + FEEDS_KEY);
  if (!feedsTxt) {
    feedsTxt = await readLocal(FEEDS_KEY);
    if (feedsTxt) {
      await putText(bucket, DATA_PREFIX + FEEDS_KEY, feedsTxt);
      info("📥 Uploaded local rss-feeds.txt to R2 ✅");
    } else {
      throw new Error("❌ rss-feeds.txt missing both locally and remotely.");
    }
  }

  // --- URL list ---
  let urlsTxt = await getObjectAsText(bucket, DATA_PREFIX + URLS_KEY);
  if (!urlsTxt) {
    urlsTxt = await readLocal(URLS_KEY);
    if (urlsTxt) {
      await putText(bucket, DATA_PREFIX + URLS_KEY, urlsTxt);
      info("📥 Uploaded local url-feeds.txt to R2 ✅");
    } else {
      throw new Error("❌ url-feeds.txt missing both locally and remotely.");
    }
  }

  // --- Parse text content ---
  const feeds = (feedsTxt || "")
    .split(/\r?\n/)
    .map(s => s.trim())
    .filter(Boolean);
  const urls = (urlsTxt || "")
    .split(/\r?\n/)
    .map(s => s.trim())
    .filter(Boolean);

  // --- Rotation file ---
  let rotation = await getJson(bucket, DATA_PREFIX + ROTATION_KEY);
  if (!rotation || typeof rotation.lastIndex !== "number") {
    rotation = { lastIndex: 0 };
    await putJson(bucket, DATA_PREFIX + ROTATION_KEY, rotation);
    info("🔄 Initialized feed rotation index to 0");
  }

  info(`✅ Loaded ${feeds.length} feeds and ${urls.length} URLs`);
  return { bucket, feeds, urls, rotation };
}

/**
 * Saves rotation progress
 */
export async function saveRotation(nextIndex) {
  const bucket =
    process.env.R2_BUCKET_RSS_FEEDS ||
    process.env.R2_BUCKET_PODCAST ||
    "rss-feeds";
  await putJson(bucket, DATA_PREFIX + ROTATION_KEY, { lastIndex: nextIndex });
  info(`🔁 Saved feed rotation index -> ${nextIndex}`);
}
