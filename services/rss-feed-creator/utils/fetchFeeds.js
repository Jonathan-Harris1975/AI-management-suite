// services/rss-feed-creator/utils/fetchFeeds.js
// ============================================================
// 🧠 RSS Feed Fetcher — Local + R2 failover, rotation & cut-off
// ============================================================

import fs from "fs/promises";
import path from "path";
import Parser from "rss-parser";
import { info, error } from "#logger.js";
import { getObjectAsText, R2_BUCKETS } from "../../shared/utils/r2-client.js";
import { loadRotationState,saveFeedRotation } from "./feedRotationManager.js";

// ─────────────────────────────────────────────
// Internal helper: read from ./data first, else R2
// ─────────────────────────────────────────────
async function readLocalOrR2File(filename) {
  try {
    const localPath = path.resolve("data", filename);
    const local = await fs.readFile(localPath, "utf8");
    info("rss.fetchFeeds.local.success", { file: localPath });
    return local;
  } catch {
    info("rss.fetchFeeds.local.miss", { file: filename });
  }

  try {
    const text = await getObjectAsText(R2_BUCKETS.RSS_FEEDS, `data/${filename}`);
    info("rss.fetchFeeds.r2.success", { bucket: R2_BUCKETS.RSS_FEEDS, key: filename });
    return text;
  } catch (err) {
    error("rss.fetchFeeds.r2.fail", { filename, err: err.message });
    throw new Error(`Cannot load ${filename} from local or R2`);
  }
}

// ─────────────────────────────────────────────
// ENV CONFIG (extended)
// ─────────────────────────────────────────────
const MAX_ITEMS_PER_FEED = Number(process.env.MAX_ITEMS_PER_FEED) || 10;
const MAX_RSS_FEEDS_PER_RUN = Number(process.env.MAX_RSS_FEEDS_PER_RUN) || 5;
const MAX_URL_FEEDS_PER_RUN = Number(process.env.MAX_URL_FEEDS_PER_RUN) || 1;
const FEED_CUTOFF_HOURS = Number(process.env.FEED_CUTOFF_HOURS) || 24; // 24 h only recent
const FEED_CUTOFF_MS = FEED_CUTOFF_HOURS * 60 * 60 * 1000;

const parser = new Parser();

// ─────────────────────────────────────────────
// Utility: split and clean list
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
  const { rssIndex, urlIndex } = await loadFeedRotation();

  const rssFeeds = rssFeedsAll.slice(rssIndex, rssIndex + MAX_RSS_FEEDS_PER_RUN);
  const urlFeeds = urlFeedsAll.slice(urlIndex, urlIndex + MAX_URL_FEEDS_PER_RUN);

  if (rssFeeds.length === 0 && urlFeeds.length === 0) {
    throw new Error("No feeds available");
  }

  // Save next rotation index
  await saveFeedRotation(
    rssFeedsAll.length,
    urlFeedsAll.length,
    rssIndex + MAX_RSS_FEEDS_PER_RUN,
    urlIndex + MAX_URL_FEEDS_PER_RUN
  );

  const selectedFeeds = [...rssFeeds, ...urlFeeds];
  info("rss.fetchFeeds.rotation.enabled", {
    rssFeeds: rssFeeds.length,
    urlFeeds: urlFeeds.length,
  });

  const cutoffDate = Date.now() - FEED_CUTOFF_MS;
  const articles = [];

  // ───────────────────────────────
  // Fetch and filter feeds
  // ───────────────────────────────
  for (const feedUrl of selectedFeeds) {
    try {
      const parsed = await parser.parseURL(feedUrl);
      const freshItems = (parsed.items || [])
        .filter((it) => {
          const date = new Date(it.pubDate || it.isoDate || 0).getTime();
          return !isNaN(date) && date >= cutoffDate;
        })
        .slice(0, MAX_ITEMS_PER_FEED);

      for (const item of freshItems) {
        articles.push({
          title: item.title,
          summary: item.contentSnippet || item.content || "",
          link: item.link,
          pubDate: item.pubDate,
          source: feedUrl,
        });
      }

      info("rss.fetchFeeds.success", {
        feedUrl,
        fetched: parsed.items?.length || 0,
        kept: freshItems.length,
      });
    } catch (err) {
      error("rss.fetchFeeds.fail", { feedUrl, err: err.message });
    }
  }

  info("📥 Fetch complete", { total: articles.length });
  return articles;
}

export default fetchFeeds;
