// ============================================================
// 📰 Fetch Feeds Utility
// ============================================================
// Loads RSS and URL feed lists, rotates through them using
// the feedRotationManager, and returns the selected feed set.
// ============================================================

import fs from "fs";
import path from "path";
import Parser from "rss-parser";
import { info, error } from "#logger.js";
import { getObjectAsText } from "../../shared/utils/r2-client.js";
import { loadRotationState, saveFeedRotation } from "./feedRotationManager.js";

const parser = new Parser();
const R2_BUCKET = process.env.R2_BUCKET_RSS_FEEDS || "rss-feeds";

const MAX_RSS_FEEDS_PER_RUN = Number(process.env.MAX_RSS_FEEDS_PER_RUN) || 5;
const MAX_URL_FEEDS_PER_RUN = Number(process.env.MAX_URL_FEEDS_PER_RUN) || 1;

// ─────────────────────────────────────────────
// ✅ Define helper before any use
// ─────────────────────────────────────────────
export async function readLocalOrR2File(filename) {
  const localPath = path.resolve("services/rss-feed-creator/data", filename);

  // Try local file first
  if (fs.existsSync(localPath)) {
    info("rss.fetchFeeds.local.hit", { file: filename });
    return fs.readFileSync(localPath, "utf-8");
  }

  // Fallback to R2
  try {
    const text = await getObjectAsText(R2_BUCKET, `data/${filename}`);
    info("rss.fetchFeeds.r2.success", { bucket: R2_BUCKET, key: filename });
    return text;
  } catch (err) {
    error("rss.fetchFeeds.read.fail", { filename, err: err.message });
    return "";
  }
}

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────
function parseUrlList(raw = "") {
  return raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"));
}

// ─────────────────────────────────────────────
// MAIN FETCH FUNCTION
// ─────────────────────────────────────────────
export async function fetchFeeds() {
  // Load feeds from text files (local or R2)
  const rssFeedsText = await readLocalOrR2File("rss-feeds.txt");
  const urlFeedsText = await readLocalOrR2File("url-feeds.txt");

  const rssFeedsAll = parseUrlList(rssFeedsText);
  const urlFeedsAll = parseUrlList(urlFeedsText);

  // Determine rotation positions
  const { rssIndex, urlIndex } = await loadRotationState();

  const rssFeeds = rssFeedsAll.slice(rssIndex, rssIndex + MAX_RSS_FEEDS_PER_RUN);
  const urlFeeds = urlFeedsAll.slice(urlIndex, urlIndex + MAX_URL_FEEDS_PER_RUN);

  if (rssFeeds.length === 0 && urlFeeds.length === 0) {
    throw new Error("No feeds available");
  }

  // Save next rotation index
  await saveFeedRotation({
    rssIndex: (rssIndex + MAX_RSS_FEEDS_PER_RUN) % rssFeedsAll.length,
    urlIndex: (urlIndex + MAX_URL_FEEDS_PER_RUN) % urlFeedsAll.length,
  });

  const selectedFeeds = [...rssFeeds, ...urlFeeds];
  info("rss.fetchFeeds.rotation.enabled", {
    rssFeeds: rssFeeds.length,
    urlFeeds: urlFeeds.length,
    selected: selectedFeeds.length,
  });

  return selectedFeeds;
    }
