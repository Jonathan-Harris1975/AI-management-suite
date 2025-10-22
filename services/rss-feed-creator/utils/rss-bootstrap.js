// services/rss-feed-creator/utils/rss-bootstrap.js
import fs from "fs";
import fsp from "fs/promises";
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

function ensureLocalDataFilesExist() {
  const dataDir = path.join(process.cwd(), "services/rss-feed-creator/data");
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

  const feedsPath = path.join(dataDir, "feeds.txt");
  const urlsPath = path.join(dataDir, "urls.txt");

  // if missing, write placeholders for debugging
  if (!fs.existsSync(feedsPath)) {
    fs.writeFileSync(
      feedsPath,
      `https://feeds.bbci.co.uk/news/technology/rss.xml\nhttps://www.wired.com/feed/category/ai/latest/rss`
    );
    info("🆕 Created placeholder feeds.txt locally for bootstrapping.");
  }
  if (!fs.existsSync(urlsPath)) {
    fs.writeFileSync(urlsPath, "https://www.bbc.co.uk/news/technology");
    info("🆕 Created placeholder urls.txt locally for bootstrapping.");
  }

  return { feedsPath, urlsPath };
}

async function readLocalFile(filename) {
  const locations = [
    path.resolve("/app/services/rss-feed-creator/data", filename),
    path.resolve(process.cwd(), "services/rss-feed-creator/data", filename),
    path.resolve(__dirname, "../data", filename),
  ];

  for (const candidate of locations) {
    if (fs.existsSync(candidate)) {
      const txt = await fsp.readFile(candidate, "utf8");
      info(`📄 Found local file: ${candidate}`);
      return txt;
    }
  }

  error(`❌ ${filename} not found in any expected paths.`);
  return null;
}

export async function ensureR2Sources() {
  const bucket =
    process.env.R2_BUCKET_RSS_FEEDS ||
    process.env.R2_BUCKET_PODCAST ||
    "rss-feeds";
  info(`🪣 Using R2 bucket: ${bucket}`);

  ensureLocalDataFilesExist();

  // --- FEEDS ---
  let feedsTxt = await getObjectAsText(bucket, FEEDS_KEY).catch(() => null);
  if (!feedsTxt) {
    const localFeeds = await readLocalFile("feeds.txt");
    if (!localFeeds) throw new Error("❌ feeds.txt missing locally and remotely.");
    await putText(bucket, FEEDS_KEY, localFeeds);
    feedsTxt = localFeeds;
    info("📥 Uploaded feeds.txt → R2 ✅");
  } else {
    info("☁️ Found rss-feeds.txt already in R2.");
  }

  // --- URLS ---
  let urlsTxt = await getObjectAsText(bucket, URLS_KEY).catch(() => null);
  if (!urlsTxt) {
    const localUrls = await readLocalFile("urls.txt");
    if (!localUrls) throw new Error("❌ urls.txt missing locally and remotely.");
    await putText(bucket, URLS_KEY, localUrls);
    urlsTxt = localUrls;
    info("📥 Uploaded urls.txt → R2 ✅");
  } else {
    info("☁️ Found url-feeds.txt already in R2.");
  }

  // --- ROTATION ---
  let rotation;
  try {
    const txt = await getObjectAsText(bucket, ROTATION_KEY);
    rotation = JSON.parse(txt);
  } catch {
    rotation = { lastIndex: 0 };
    await putJson(bucket, ROTATION_KEY, rotation);
    info("🔄 Initialized rotation index → 0");
  }

  const feeds = feedsTxt.split(/\r?\n/).filter(Boolean);
  const urls = urlsTxt.split(/\r?\n/).filter(Boolean);

  info(`✅ Feeds loaded: ${feeds.length}, URLs: ${urls.length}`);
  return { bucket, feeds, urls, rotation };
}

export async function saveRotation(nextIndex) {
  const bucket =
    process.env.R2_BUCKET_RSS_FEEDS ||
    process.env.R2_BUCKET_PODCAST ||
    "rss-feeds";
  await putJson(bucket, ROTATION_KEY, { lastIndex: nextIndex });
  info(`🔁 Saved feed rotation index → ${nextIndex}`);
}
