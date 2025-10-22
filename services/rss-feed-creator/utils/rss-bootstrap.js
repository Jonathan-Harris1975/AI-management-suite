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
 * Local JSON helper (replaces missing getJson)
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
 * ✅ Ultra-robust local reader — works across Render, Shiper, local dev
 */
async function readLocal(relative) {
  const candidates = [
    `/app/services/rss-feed-creator/data/${relative}`, // Render absolute
    `/opt/render/project/src/services/rss-feed-creator/data/${relative}`, // Shiper path
    path.join(process.cwd(), "services", "rss-feed-creator", "data", relative), // local dev
    path.join(__dirname, "..", "data", relative),
    path.join(process.cwd(), "data", relative),
  ];

  for (const candidate of candidates) {
    try {
      const txt = await fs.readFile(candidate, "utf8");
      info(`📄 Found local data file: ${candidate}`);
      return txt;
    } catch {
      // try next path
    }
  }

  error(`⚠️ Local data file not found anywhere for ${relative}`);
  return null;
}

/**
 * Ensure R2 data sources exist:
 * - rss-feeds.txt (list of feed URLs)
 * - url-feeds.txt (list of destination URLs)
 * - feed-rotation.json { lastIndex }
 */
export async function ensureR2Sources() {
  const bucket = process.env.R2_BUCKET_RSS_FEEDS || process.env.R2_BUCKET_PODCAST || "";
  if (!bucket)
    throw new Error("❌ Missing R2 bucket for RSS data (set R2_BUCKET_RSS_FEEDS).");

  // --- FEEDS LIST ---
  let feedsTxt = await getObjectAsText(bucket, DATA_PREFIX + FEEDS_KEY);
  if (!feedsTxt) {
    feedsTxt = await readLocal(FEEDS_KEY);
    if (feedsTxt) {
      await putText(bucket, DATA_PREFIX + FEEDS_KEY, feedsTxt);
      info("📥 Uploaded local rss-feeds.txt to R2 ✅");
    } else {
      throw new Error("❌ Missing local rss-feeds.txt — unable to bootstrap feeds.");
    }
  }

  // --- URL LIST ---
  let urlsTxt = await getObjectAsText(bucket, DATA_PREFIX + URLS_KEY);
  if (!urlsTxt) {
    urlsTxt = await readLocal(URLS_KEY);
    if (urlsTxt) {
      await putText(bucket, DATA_PREFIX + URLS_KEY, urlsTxt);
      info("📥 Uploaded local url-feeds.txt to R2 ✅");
    } else {
      throw new Error("❌ Missing local url-feeds.txt — unable to bootstrap feeds.");
    }
  }

  // Parse feeds
  const feeds = (feedsTxt || "")
    .split(/\r?\n/)
    .map(s => s.trim())
    .filter(Boolean);

  // Parse URLs
  const urls = (urlsTxt || "")
    .split(/\r?\n/)
    .map(s => s.trim())
    .filter(Boolean);

  // --- ROTATION ---
  let rotation = await getJson(bucket, DATA_PREFIX + ROTATION_KEY);
  if (!rotation || typeof rotation.lastIndex !== "number") {
    rotation = { lastIndex: 0 };
    await putJson(bucket, DATA_PREFIX + ROTATION_KEY, rotation);
    info("🔄 Initialized feed rotation to index 0");
  }

  return { bucket, feeds, urls, rotation };
}

/**
 * Persist next rotation index
 */
export async function saveRotation(nextIndex) {
  const bucket = process.env.R2_BUCKET_RSS_FEEDS || process.env.R2_BUCKET_PODCAST || "";
  if (!bucket)
    throw new Error("❌ Missing R2 bucket for RSS data (set R2_BUCKET_RSS_FEEDS).");

  await putJson(bucket, DATA_PREFIX + ROTATION_KEY, { lastIndex: nextIndex });
  info(`🔁 Saved feed rotation index -> ${nextIndex}`);
}
