// services/rss-feed-creator/utils/rss-bootstrap.js
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { info, error } from "#logger.js";
import { getObjectAsText, putText, putJson } from "#shared/r2-client.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_PREFIX = "data/";
const FEEDS_KEY = `${DATA_PREFIX}rss-feeds.txt`;
const URLS_KEY = `${DATA_PREFIX}url-feeds.txt`;
const ROTATION_KEY = `${DATA_PREFIX}feed-rotation.json`;

/**
 * 🔍 Look for local files in all possible deployment paths
 */
async function readLocalFile(filename) {
  const candidates = [
    path.resolve("/app/services/rss-feed-creator/data", filename),
    path.resolve("/app/src/services/rss-feed-creator/data", filename),
    path.resolve(process.cwd(), "services", "rss-feed-creator", "data", filename),
    path.resolve(__dirname, "../data", filename),
  ];

  for (const candidate of candidates) {
    try {
      const data = await fs.readFile(candidate, "utf8");
      info(`📄 Found local file: ${candidate}`);
      return data;
    } catch {
      /* continue */
    }
  }
  return null;
}

/**
 * 🧩 Ensure all RSS data sources exist in R2 (without overwriting real data)
 */
export async function ensureR2Sources() {
  const bucket =
    process.env.R2_BUCKET_RSS_FEEDS ||
    process.env.R2_BUCKET_PODCAST ||
    "rss-feeds";

  info(`🪣 Using R2 bucket: ${bucket}`);

  // --- FEEDS LIST ---
  let feedsTxt = await getObjectAsText(bucket, FEEDS_KEY).catch(() => null);
  if (!feedsTxt) {
    const localFeeds = await readLocalFile("feeds.txt");
    if (localFeeds) {
      await putText(bucket, FEEDS_KEY, localFeeds);
      feedsTxt = localFeeds;
      info("📥 Uploaded your actual feeds.txt → R2 ✅");
    } else {
      error("❌ No local feeds.txt found — using last known or fallback feed list.");
      feedsTxt = `https://feeds.bbci.co.uk/news/technology/rss.xml\nhttps://www.wired.com/feed/category/ai/latest/rss`;
      await putText(bucket, FEEDS_KEY, feedsTxt);
      info("📥 Uploaded fallback feeds.txt → R2 ⚠️");
    }
  } else {
    info("☁️ Found rss-feeds.txt already in R2 — not overwriting.");
  }

  // --- URL LIST ---
  let urlsTxt = await getObjectAsText(bucket, URLS_KEY).catch(() => null);
  if (!urlsTxt) {
    const localUrls = await readLocalFile("urls.txt");
    if (localUrls) {
      await putText(bucket, URLS_KEY, localUrls);
      urlsTxt = localUrls;
      info("📥 Uploaded your actual urls.txt → R2 ✅");
    } else {
      error("❌ No local urls.txt found — using fallback URL.");
      urlsTxt = `https://www.bbc.co.uk/news/technology`;
      await putText(bucket, URLS_KEY, urlsTxt);
      info("📥 Uploaded fallback urls.txt → R2 ⚠️");
    }
  } else {
    info("☁️ Found url-feeds.txt already in R2 — not overwriting.");
  }

  // --- ROTATION STATE ---
  let rotation;
  try {
    const txt = await getObjectAsText(bucket, ROTATION_KEY);
    rotation = JSON.parse(txt);
  } catch {
    rotation = { lastIndex: 0 };
    await putJson(bucket, ROTATION_KEY, rotation);
    info("🔄 Initialized feed rotation index → 0");
  }

  const feeds = feedsTxt.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  const urls = urlsTxt.split(/\r?\n/).map(s => s.trim()).filter(Boolean);

  info(`✅ Feeds loaded: ${feeds.length}, URLs: ${urls.length}`);
  return { bucket, feeds, urls, rotation };
}

/**
 * 🔁 Save updated feed rotation index to R2
 */
export async function saveRotation(nextIndex) {
  const bucket =
    process.env.R2_BUCKET_RSS_FEEDS ||
    process.env.R2_BUCKET_PODCAST ||
    "rss-feeds";

  try {
    await putJson(bucket, ROTATION_KEY, { lastIndex: nextIndex });
    info(`🔁 Saved feed rotation index → ${nextIndex}`);
  } catch (err) {
    error(`❌ Failed to save rotation index: ${err.message}`);
  }
}
