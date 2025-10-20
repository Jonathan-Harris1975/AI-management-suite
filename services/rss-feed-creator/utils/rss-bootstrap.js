// services/rss-feed-creator/utils/rss-bootstrap.js
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { info, error } from "#logger.js";
import { getObjectAsText, putText, putJson, getJson } from "../shared/utils/r2-client.js";

const FEEDS_KEY = "rss-feeds.txt";
const URLS_KEY = "url-feeds.txt";
const ROTATION_KEY = "feed-rotation.json";

// Resolve local data folder (no ?raw imports)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dataDir = path.resolve(__dirname, "../data");

async function readLocalText(fileName) {
  const p = path.join(dataDir, fileName);
  try {
    return await fs.readFile(p, "utf8");
  } catch (e) {
    error("❌ Failed to read local default file", { file: p, err: e.message });
    return "";
  }
}

function normalizeLines(txt) {
  return (txt || "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
}

export async function ensureR2Sources() {
  info("🧩 RSS bootstrap: verifying R2 source files");

  let feedsText = await getObjectAsText(FEEDS_KEY).catch(() => null);
  let urlsText = await getObjectAsText(URLS_KEY).catch(() => null);
  let rotation = await getJson(ROTATION_KEY).catch(() => null);

  if (!feedsText) {
    const localFeeds = await readLocalText("rss-feeds.txt");
    if (!localFeeds) throw new Error("Local fallback rss-feeds.txt not found");
    info("📂 rss-feeds.txt missing in R2 — uploading local default");
    await putText(FEEDS_KEY, localFeeds);
    feedsText = localFeeds;
  }

  if (!urlsText) {
    const localUrls = await readLocalText("url-feeds.txt");
    if (!localUrls) throw new Error("Local fallback url-feeds.txt not found");
    info("🔗 url-feeds.txt missing in R2 — uploading local default");
    await putText(URLS_KEY, localUrls);
    urlsText = localUrls;
  }

  if (!rotation) {
    info("🧭 feed-rotation.json missing in R2 — creating with lastIndex: 0");
    rotation = { lastIndex: 0, updatedAt: new Date().toISOString() };
    await putJson(ROTATION_KEY, rotation);
  }

  const feeds = normalizeLines(feedsText);
  const urls = normalizeLines(urlsText);

  if (!feeds.length && !urls.length) {
    throw new Error("No source URLs found in rss-feeds.txt or url-feeds.txt");
  }

  return { feeds, urls, rotation };
}

export async function saveRotation(nextIndex) {
  const rot = { lastIndex: nextIndex, updatedAt: new Date().toISOString() };
  await putJson(ROTATION_KEY, rot);
  return rot;
}
