// services/rss-feed-creator/utils/rss-bootstrap.js
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { info, error } from "#logger.js";
// ✅ Use imports map for shared utils; drop the non-existent named export `getJson`
import { getObjectAsText, putText, putJson } from "#shared/r2-client.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const FEEDS_KEY = "rss-feeds.txt";
const URLS_KEY = "url-feeds.txt";
const ROTATION_KEY = "feed-rotation.json";
const DATA_PREFIX = "data/";

/**
 * Local JSON helper to replace missing getJson export from r2-client.
 * Returns `null` when the object doesn't exist or JSON is invalid.
 */
const getJson = async (bucket, key) => {
  try {
    const txt = await getObjectAsText(bucket, key);
    if (!txt) return null;
    return JSON.parse(txt);
  } catch (e) {
    return null;
  }
};

/**
 * Read local text file from /data as fallback.
 */
async function readLocal(relative) {
  const p = path.join(__dirname, "..", "..", "..", "data", relative);
  try {
    return await fs.readFile(p, "utf8");
  } catch {
    return null;
  }
}

/**
 * Ensure the R2 data sources exist:
 * - rss-feeds.txt    (list of feed object keys under data/)
 * - url-feeds.txt    (list of URLs under data/)
 * - feed-rotation.json { lastIndex }
 * Returns { feeds, urls, rotation, bucket }
 */
export async function ensureR2Sources() {
  const bucket = process.env.R2_BUCKET_RSS_FEEDS || process.env.R2_BUCKET_PODCAST || "";
  if (!bucket) throw new Error("Missing R2 bucket for RSS data (set R2_BUCKET_RSS_FEEDS).");

  // Try fetch remote feeds list; fallback to local /data files
  let feedsTxt = await getObjectAsText(bucket, DATA_PREFIX + FEEDS_KEY);
  if (!feedsTxt) {
    feedsTxt = await readLocal(FEEDS_KEY);
    if (feedsTxt) {
      await putText(bucket, DATA_PREFIX + FEEDS_KEY, feedsTxt);
      info("📥 Uploaded local rss-feeds.txt to R2");
    }
  }

  let urlsTxt = await getObjectAsText(bucket, DATA_PREFIX + URLS_KEY);
  if (!urlsTxt) {
    urlsTxt = await readLocal(URLS_KEY);
    if (urlsTxt) {
      await putText(bucket, DATA_PREFIX + URLS_KEY, urlsTxt);
      info("📥 Uploaded local url-feeds.txt to R2");
    }
  }

  const feeds = (feedsTxt || "")
    .split(/\r?\n/)
    .map(s => s.trim())
    .filter(Boolean)
    .map(s => s.startsWith(DATA_PREFIX) ? s : DATA_PREFIX + s);

  const urls = (urlsTxt || "")
    .split(/\r?\n/)
    .map(s => s.trim())
    .filter(Boolean);

  // Rotation state
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
  if (!bucket) throw new Error("Missing R2 bucket for RSS data (set R2_BUCKET_RSS_FEEDS).");
  await putJson(bucket, DATA_PREFIX + ROTATION_KEY, { lastIndex: nextIndex });
  info(`🔁 Saved feed rotation index -> ${nextIndex}`);
}
