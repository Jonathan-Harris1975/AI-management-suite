// ============================================================
// 🧠 RSS Feed Creator — Rotating Feed Fetcher (Fixed)
// ============================================================
// - Rotates 5 RSS + 1 URL per run via feedRotationManager.js
// - Enforces MAX_ITEMS_PER_FEED & FEED_CUTOFF_HOURS
// - Falls back to static slice if rotation manager fails
// ============================================================

import fs from "fs";
import path from "path";
import Parser from "rss-parser";
import { info, error } from "#logger.js";
import { getObjectAsText } from "../../shared/utils/r2-client.js";
import { loadNextFeedBatch } from "./feedRotationManager.js";

const parser = new Parser();

// ─────────────────────────────────────────────
// ENV CONFIG
// ─────────────────────────────────────────────
const MAX_ITEMS_PER_FEED = Number(process.env.MAX_ITEMS_PER_FEED) || 10;
const FEED_CUTOFF_HOURS = Number(process.env.FEED_CUTOFF_HOURS) || 1440; // 60 days
const FEED_CUTOFF_MS = FEED_CUTOFF_HOURS * 60 * 60 * 1000;
const MAX_RSS_FEEDS_PER_RUN = Number(process.env.MAX_RSS_FEEDS_PER_RUN) || 5;
const MAX_URL_FEEDS_PER_RUN = Number(process.env.MAX_URL_FEEDS_PER_RUN) || 1;

// ─────────────────────────────────────────────
// Helpers (define early to avoid reference errors)
// ─────────────────────────────────────────────
function parseUrlList(text) {
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith("#"));
}

async function readLocalOrR2File(filename, bucket = "rss-feeds") {
  const localPath = path.resolve("services/rss-feed-creator/data", filename);
  if (fs.existsSync(localPath)) {
    return fs.readFileSync(localPath, "utf-8");
  }
  try {
    return await getObjectAsText(bucket, `data/${filename}`);
  } catch (err) {
    error("rss.readLocalOrR2File.fail", { filename, err: err.message });
    return "";
  }
}

// ─────────────────────────────────────────────
// MAIN FETCH FUNCTION
// ─────────────────────────────────────────────
export async function fetchFeeds() {
  let rssFeeds = [];
  let urlFeeds = [];

  // Attempt rotation-based feed selection
  try {
    const batch = await loadNextFeedBatch();
    rssFeeds = batch.rssFeeds || [];
    urlFeeds = batch.urlFeeds || [];

    info("rss.fetchFeeds.rotation.enabled", {
      rssFeeds: rssFeeds.length,
      urlFeeds: urlFeeds.length,
    });
  } catch (err) {
    error("rss.fetchFeeds.rotation.fail", { error: err.message });

    // ✅ Fallback to static selection (helpers now defined above)
    const rssFeedsText = await readLocalOrR2File("rss-feeds.txt");
    const urlFeedsText = await readLocalOrR2File("url-feeds.txt");
    rssFeeds = parseUrlList(rssFeedsText).slice(0, MAX_RSS_FEEDS_PER_RUN);
    urlFeeds = parseUrlList(urlFeedsText).slice(0, MAX_URL_FEEDS_PER_RUN);

    info("rss.fetchFeeds.fallback.static", {
      rssFeeds: rssFeeds.length,
      urlFeeds: urlFeeds.length,
    });
  }

  if (rssFeeds.length === 0 && urlFeeds.length === 0) {
    throw new Error("No feeds available");
  }

  const selectedFeeds = [...rssFeeds, ...urlFeeds];
  const cutoffDate = Date.now() - FEED_CUTOFF_MS;
  const articles = [];

  info("rss.fetchFeeds.start", {
    totalFeeds: selectedFeeds.length,
    MAX_ITEMS_PER_FEED,
    FEED_CUTOFF_HOURS,
  });

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
