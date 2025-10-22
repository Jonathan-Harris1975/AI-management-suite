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

// 💾 Auto-create minimal fallback feeds if missing
const FALLBACK_FEEDS = `https://feeds.bbci.co.uk/news/technology/rss.xml
https://www.wired.com/feed/category/ai/latest/rss`;
const FALLBACK_URLS = `https://www.bbc.co.uk/news/technology`;

async function readLocalFile(filename) {
  const candidates = [
    "/app/services/rss-feed-creator/data/" + filename,
    "/app/src/services/rss-feed-creator/data/" + filename,
    path.resolve(process.cwd(), "services", "rss-feed-creator", "data", filename),
    path.resolve(__dirname, "../data", filename),
  ];

  for (const file of candidates) {
    try {
      const data = await fs.readFile(file, "utf8");
      info(`📄 Found local data file: ${file}`);
      return data;
    } catch {
      /* continue */
    }
  }

  // 🛠️ Auto-create if missing in Render
  const defaultPath = "/app/services/rss-feed-creator/data";
  try {
    await fs.mkdir(defaultPath, { recursive: true });
    const fallback =
      filename === "feeds.txt" ? FALLBACK_FEEDS : FALLBACK_URLS;
    await fs.writeFile(path.join(defaultPath, filename), fallback, "utf8");
    info(`🆕 Created fallback ${filename} at ${defaultPath}`);
    return fallback;
  } catch (err) {
    error(`❌ Failed to create fallback file: ${filename}`, err);
    return null;
  }
}

/**
 * Ensure RSS data exists locally and in R2.
 */
export async function ensureR2Sources() {
  const bucket =
    process.env.R2_BUCKET_RSS_FEEDS ||
    process.env.R2_BUCKET_PODCAST ||
    "rss-feeds";

  info(`🪣 Using R2 bucket: ${bucket}`);

  // --- feeds.txt ---
  let feedsTxt = await getObjectAsText(bucket, FEEDS_KEY).catch(() => null);
  if (!feedsTxt) {
    const localFeeds = await readLocalFile("feeds.txt");
    if (!localFeeds)
      throw new Error("❌ feeds.txt missing locally and remotely.");
    await putText(bucket, FEEDS_KEY, localFeeds);
    feedsTxt = localFeeds;
    info("📥 Uploaded feeds.txt → R2 ✅");
  }

  // --- urls.txt ---
  let urlsTxt = await getObjectAsText(bucket, URLS_KEY).catch(() => null);
  if (!urlsTxt) {
    const localUrls = await readLocalFile("urls.txt");
    if (!localUrls)
      throw new Error("❌ urls.txt missing locally and remotely.");
    await putText(bucket, URLS_KEY, localUrls);
    urlsTxt = localUrls;
    info("📥 Uploaded urls.txt → R2 ✅");
  }

  // --- rotation.json ---
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
 * Save rotation index update.
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
