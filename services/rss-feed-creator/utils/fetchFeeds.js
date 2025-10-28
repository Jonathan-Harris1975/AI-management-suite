// ============================================================
// 🧠 RSS Feed Fetcher — 24h Fresh Items Only
// ============================================================

import Parser from "rss-parser";
import { info, error } from "#logger.js";
import { loadNextFeedBatch } from "./feedRotationManager.js";

const parser = new Parser();

// Env vars
const MAX_ITEMS_PER_FEED = Number(process.env.MAX_ITEMS_PER_FEED) || 10;
const MAX_RSS_FEEDS_PER_RUN = Number(process.env.MAX_RSS_FEEDS_PER_RUN) || 5;
const MAX_URL_FEEDS_PER_RUN = Number(process.env.MAX_URL_FEEDS_PER_RUN) || 1;
const FEED_FRESHNESS_HOURS = Number(process.env.FEED_FRESHNESS_HOURS) || 24;
const FEED_FRESHNESS_MS = FEED_FRESHNESS_HOURS * 60 * 60 * 1000;

// ─────────────────────────────────────────────
export async function fetchFeeds() {
  const { rssFeeds, urlFeeds } = await loadNextFeedBatch();
  const selectedFeeds = [
    ...rssFeeds.slice(0, MAX_RSS_FEEDS_PER_RUN),
    ...urlFeeds.slice(0, MAX_URL_FEEDS_PER_RUN),
  ];

  if (selectedFeeds.length === 0) throw new Error("No feeds available");

  info("rss.fetchFeeds.start", {
    totalFeeds: selectedFeeds.length,
    MAX_ITEMS_PER_FEED,
    FEED_FRESHNESS_HOURS,
  });

  const articles = [];
  const cutoffDate = Date.now() - FEED_FRESHNESS_MS;

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
