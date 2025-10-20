import { info, error } from "../../../shared/utils/logger.js";
import { getObjectAsText, putText, putJson, getJson } from "../../../shared/utils/r2-client.js";

const FEEDS_KEY = "rss-feeds.txt";
const URLS_KEY = "url-feeds.txt";
const ROTATION_KEY = "feed-rotation.json";

function normalizeLines(txt) {
  return (txt || "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
}

export async function ensureR2Sources({ localFeeds, localUrls }) {
  info("🧩 RSS bootstrap: verifying R2 source files");

  let feedsText = await getObjectAsText(FEEDS_KEY).catch(() => null);
  let urlsText = await getObjectAsText(URLS_KEY).catch(() => null);
  let rotation = await getJson(ROTATION_KEY).catch(() => null);

  // Upload local defaults if missing
  if (!feedsText && localFeeds) {
    info("📂 rss-feeds.txt missing in R2 — uploading local default");
    await putText(FEEDS_KEY, localFeeds);
    feedsText = localFeeds;
  }
  if (!urlsText && localUrls) {
    info("🔗 url-feeds.txt missing in R2 — uploading local default");
    await putText(URLS_KEY, localUrls);
    urlsText = localUrls;
  }
  if (!rotation) {
    info("🧭 feed-rotation.json missing in R2 — creating with lastIndex: 0");
    rotation = { lastIndex: 0, updatedAt: new Date().toISOString() };
    await putJson(ROTATION_KEY, rotation);
  }

  if (!feedsText) throw new Error("rss-feeds.txt not available in R2 or local fallback");
  if (!urlsText) throw new Error("url-feeds.txt not available in R2 or local fallback");

  const feeds = normalizeLines(feedsText);
  const urls = normalizeLines(urlsText);

  return { feeds, urls, rotation };
}

export async function saveRotation(nextIndex) {
  const rot = { lastIndex: nextIndex, updatedAt: new Date().toISOString() };
  await putJson(ROTATION_KEY, rot);
  return rot;
}
