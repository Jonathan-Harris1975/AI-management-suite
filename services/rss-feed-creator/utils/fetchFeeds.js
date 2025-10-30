// ============================================================
// 📰 Fetch Feeds Utility
// ============================================================
// Loads RSS and URL feed lists, rotates through them using
// the feedRotationManager, and returns the selected feed set.
// ============================================================

import Parser from "rss-parser";
import { info } from "#logger.js";
import { loadRotationState, saveFeedRotation } from "./feedRotationManager.js";
import { readLocalOrR2File } from "./fileReader.js";

const parser = new Parser();

const MAX_RSS_FEEDS_PER_RUN = Number(process.env.MAX_RSS_FEEDS_PER_RUN) || 5;
const MAX_URL_FEEDS_PER_RUN = Number(process.env.MAX_URL_FEEDS_PER_RUN) || 1;

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
