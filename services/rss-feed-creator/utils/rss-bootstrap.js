import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { info, error , debug} from "#logger.js";
import { getObjectAsText, putText, putJson } from "#shared/r2-client.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// R2 keys
const DATA_PREFIX = "data/";
const FEEDS_KEY = `${DATA_PREFIX}rss-feeds.txt`;
const URLS_KEY = `${DATA_PREFIX}url-feeds.txt`;
const ROTATION_KEY = `${DATA_PREFIX}feed-rotation.json`;

/**
 * Try all known local locations for feeds.txt / urls.txt
 */
async function readLocalFile(filename) {
  const candidates = [
    path.resolve("/app/services/rss-feed-creator/data", filename),
    path.resolve(process.cwd(), "services/rss-feed-creator/data", filename),
    path.resolve(__dirname, "../data", filename),
  ];

  for (const candidate of candidates) {
    try {
      const txt = await fs.readFile(candidate, "utf8");
      info(`🟩 Found local data file: ${candidate}`);
      return txt;
    } catch {
      debug (`⚙️ Checked but not found: ${candidate}`);
    }
  }

  error(`❌ Could not locate ${filename} in any known paths.`);
  return null;
}

/**
 * Ensure that R2 has the *real* data, not placeholders.
 */
export async function ensureR2Sources() {
  const bucket =
    process.env.R2_BUCKET_RSS_FEEDS ||
    process.env.R2_BUCKET_PODCAST ||
    "rss-feeds";

  debug(`🪣 Using R2 bucket: ${bucket}`);

  // --- FEEDS ---
  let feedsTxt = await getObjectAsText(bucket, FEEDS_KEY).catch(() => null);
  if (!feedsTxt) {
    const localFeeds = await readLocalFile("feeds.txt");
    if (!localFeeds) throw new Error("❌ feeds.txt missing locally and remotely.");
    await putText(bucket, FEEDS_KEY, localFeeds);
    feedsTxt = localFeeds;
    info("📥 Uploaded real feeds.txt → R2 ✅");
  } else {
    info("🗃️  rss-feeds.txt already exists in R2 — skipping upload.");
  }

  // --- URLS ---
  let urlsTxt = await getObjectAsText(bucket, URLS_KEY).catch(() => null);
  if (!urlsTxt) {
    const localUrls = await readLocalFile("urls.txt");
    if (!localUrls) throw new Error("❌ urls.txt missing locally and remotely.");
    await putText(bucket, URLS_KEY, localUrls);
    urlsTxt = localUrls;
    info("📥 Uploaded real urls.txt → R2 ✅");
  } else {
    info("🗃️ url-feeds.txt already exists in R2 — skipping upload.");
  }

  // --- ROTATION ---
  let rotation;
  try {
    const txt = await getObjectAsText(bucket, ROTATION_KEY);
    rotation = JSON.parse(txt);
  } catch {
    rotation = { lastIndex: 0 };
    await putJson(bucket, ROTATION_KEY, rotation);
    info("🔄 Initialized feed rotation → 0");
  }

  const feeds = feedsTxt.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  const urls = urlsTxt.split(/\r?\n/).map(s => s.trim()).filter(Boolean);

  info(`🟩 Feeds loaded: ${feeds.length}, URLs: ${urls.length}`);
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

  await putJson(bucket, ROTATION_KEY, { lastIndex: nextIndex });
  info(`🔁 Saved feed rotation index → ${nextIndex}`);
}
