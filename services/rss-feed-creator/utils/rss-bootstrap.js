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

async function readLocalFile(filename) {
  const candidates = [
    path.join(process.cwd(), "services", "rss-feed-creator", "data", filename),
    path.join("/app/src/services/rss-feed-creator/data", filename),
    path.join("/app/services/rss-feed-creator/data", filename),
    path.join(__dirname, "../data", filename),
  ];
  for (const file of candidates) {
    try {
      const data = await fs.readFile(file, "utf8");
      info(`📄 Found local file: ${file}`);
      return data;
    } catch { /* skip */ }
  }
  return null;
}

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
    if (!localFeeds) throw new Error("❌ feeds.txt missing locally and remotely.");
    await putText(bucket, FEEDS_KEY, localFeeds);
    feedsTxt = localFeeds;
    info("📥 Uploaded feeds.txt → R2 ✅");
  }

  // --- urls.txt ---
  let urlsTxt = await getObjectAsText(bucket, URLS_KEY).catch(() => null);
  if (!urlsTxt) {
    const localUrls = await readLocalFile("urls.txt");
    if (!localUrls) throw new Error("❌ urls.txt missing locally and remotely.");
    await putText(bucket, URLS_KEY, localUrls);
    urlsTxt = localUrls;
    info("📥 Uploaded urls.txt → R2 ✅");
  }

  // --- rotation ---
  let rotation;
  try {
    const txt = await getObjectAsText(bucket, ROTATION_KEY);
    rotation = JSON.parse(txt);
  } catch {
    rotation = { lastIndex: 0 };
    await putJson(bucket, ROTATION_KEY, rotation);
    info("🔄 Initialized feed rotation to 0");
  }

  const feeds = feedsTxt.split(/\r?\n/).filter(Boolean);
  const urls = urlsTxt.split(/\r?\n/).filter(Boolean);

  info(`✅ Feeds loaded: ${feeds.length}, URLs: ${urls.length}`);
  return { bucket, feeds, urls, rotation };
}
