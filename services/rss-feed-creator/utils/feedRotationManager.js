// ============================================================
// 🧭 Feed Rotation Manager
// ============================================================
// Rotates through rss-feeds.txt and url-feeds.txt on each endpoint call
// Persists rotation index in R2 (feed-rotation.json)
// ============================================================

import fs from "fs";
import path from "path";
import rssLogger from "./rss-logger.js";
const info = (...args) => rssLogger.info(...args);
const error = (...args) => rssLogger.error(...args);
import { getObjectAsText, putJson } from "../../shared/utils/r2-client.js";

const R2_BUCKET = process.env.R2_BUCKET_RSS_FEEDS || "rss-feeds";

const ROTATION_FILE = "data/feed-rotation.json";
const RSS_FILE = "rss-feeds.txt";
const URL_FILE = "url-feeds.txt";

const MAX_RSS_FEEDS_PER_RUN = Number(process.env.MAX_RSS_FEEDS_PER_RUN) || 5;
const MAX_URL_FEEDS_PER_RUN = Number(process.env.MAX_URL_FEEDS_PER_RUN) || 1;

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────
function parseList(text = "") {
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith("#"));
}

async function readFileOrR2(filename) {
  const localPath = path.resolve("services/rss-feed-creator/data", filename);
  if (fs.existsSync(localPath)) {
    return fs.readFileSync(localPath, "utf-8");
  }
  try {
    return await getObjectAsText(R2_BUCKET, `data/${filename}`);
  } catch (err) {
    error("feedRotation.readFile.fail", { filename, err: err.message });
    return "";
  }
}

// ─────────────────────────────────────────────
// Load and Save Rotation State
// ─────────────────────────────────────────────
export async function loadRotationState() {
  try {
    const text = await getObjectAsText(R2_BUCKET, ROTATION_FILE);
    return JSON.parse(text);
  } catch {
    return { rssIndex: 0, urlIndex: 0 };
  }
}

export async function saveFeedRotation(state) {
  await putJson(R2_BUCKET, ROTATION_FILE, state);
  info("feedRotation.saved", state);
}

// ─────────────────────────────────────────────
// Main Rotation Logic
// ─────────────────────────────────────────────
export async function loadNextFeedBatch() {
  const rssText = await readFileOrR2(RSS_FILE);
  const urlText = await readFileOrR2(URL_FILE);
  const rssList = parseList(rssText);
  const urlList = parseList(urlText);

  if (rssList.length === 0 && urlList.length === 0) {
    throw new Error("No feeds found in either file");
  }

  const rotation = await loadRotationState();
  const rssIndex = rotation.rssIndex || 0;
  const urlIndex = rotation.urlIndex || 0;

  const nextRss = [];
  for (let i = 0; i < MAX_RSS_FEEDS_PER_RUN; i++) {
    nextRss.push(rssList[(rssIndex + i) % rssList.length]);
  }

  const nextUrl = [];
  for (let i = 0; i < MAX_URL_FEEDS_PER_RUN; i++) {
    nextUrl.push(urlList[(urlIndex + i) % urlList.length]);
  }

  const newState = {
    rssIndex: (rssIndex + MAX_RSS_FEEDS_PER_RUN) % rssList.length,
    urlIndex: (urlIndex + MAX_URL_FEEDS_PER_RUN) % urlList.length,
  };

  await saveFeedRotation(newState);

  info("feedRotation.nextBatch", {
    rssIndex,
    urlIndex,
    nextRssCount: nextRss.length,
    nextUrlCount: nextUrl.length,
  });

  return {
    rssFeeds: nextRss,
    urlFeeds: nextUrl,
  };
}
