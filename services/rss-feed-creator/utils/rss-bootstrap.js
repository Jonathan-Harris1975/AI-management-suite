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
 * Simple JSON parser that fails gracefully
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
 * ✅ Robust local file reader that works on:
 * - Render ( /app/... )
 * - Shiper ( /opt/render/project/src/... )
 * - Local dev ( ./services/rss-feed-creator/data/... )
 */
async function readLocal(relative) {
  const candidates = [
    `/app/services/rss-feed-creator/data/${relative}`, // Render
    `/opt/render/project/src/services/rss-feed-creator/data/${relative}`, // Shiper
    path.join(process.cwd(), "services", "rss-feed-creator", "data", relative), // Local dev
    path.join(__dirname, "..", "data", relative), // relative to utils
    path.join(process.cwd(), "data", relative), // fallback
  ];

  for (const candidate of candidates) {
    try {
      const txt = await fs.readFile(candidate, "utf8");
      info(`📄 Found local data file: ${candidate}`);
      return txt;
    } catch {
      // Try next candidate
    }
  }

  error(`❌ Local data file not found for ${relative}`);
  return null;
}

/**
 * Ensures the presence of:
 * - rss-feeds.txt   (list of feed URLs)
 * - url-feeds.txt   (list of destination URLs)
 * - feed-rotation.json
 */
export async function ensureR2Sources() {
  const bucket =
    process.env.R2_BUCKET_RSS_FEEDS ||
    process.env.R2_BUCKET_PODCAST ||
    "rss-feeds";
  if (!bucket) throw new Error("❌ Missing R2 bucket for RSS data.");

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

  // --- Parse content ---
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
    info("🔄 Initialized feed rotation at index 0");
  }

  info(`✅ Loaded ${feeds.length} feeds and ${urls.length} URLs from R2`);
  return { bucket, feeds, urls, rotation };
}

/**
 * Saves the rotation index back to R2
 */
export async function saveRotation(nextIndex) {
  const bucket =
    process.env.R2_BUCKET_RSS_FEEDS ||
    process.env.R2_BUCKET_PODCAST ||
    "rss-feeds";
  await putJson(bucket, DATA_PREFIX + ROTATION_KEY, { lastIndex: nextIndex });
  info(`🔁 Saved feed rotation index -> ${nextIndex}`);
}
