import scriptLogger from "./script-logger.js";
const { info, warn, error, debug } = scriptLogger;
// services/script/utils/fetchFeeds.js
import Parser from "rss-parser";
import fetch from "node-fetch";

const parser = new Parser();

function withinDays(dateValue, days = 7) {
  if (!dateValue) return false;
  const pubDate = new Date(dateValue);
  if (Number.isNaN(pubDate.getTime())) return false;
  const diffDays = (Date.now() - pubDate.getTime()) / (1000 * 60 * 60 * 24);
  return diffDays <= days;
}

// simple relevance score: newer + has title + has content
function calculateArticleScore(item) {
  let score = 0;
  if (item.title) score += 3;
  if (item.contentSnippet || item.summary || item.description) score += 2;
  if (item.pubDate || item.isoDate || item.published) score += 1;
  return score;
}

export default async function fetchFeedArticles({
  feedUrl = process.env.AI_NEWS_FEED_URL || "https://ai-news.jonathan-harris.online/feed.xml",
  windowDays = 7,
} = {}) {
  try {
    debug("rss.fetch.start", { feedUrl, windowDays });

    const res = await fetch(feedUrl);
    if (!res.ok) {
      throw new Error(`RSS fetch failed: ${res.status} ${res.statusText}`);
    }

    const text = await res.text();
    const feed = await parser.parseString(text);

    const allItems = feed.items || [];
    const recent = allItems.filter((it) =>
      withinDays(it.pubDate || it.isoDate || it.published, windowDays)
    );

    const scoredItems = recent
      .map((item) => ({ ...item, score: calculateArticleScore(item) }))
      .sort((a, b) => b.score - a.score);

    debug("rss.fetch.summary", {
      feedUrl,
      windowDays,
      totalItems: allItems.length,
      recentItems: recent.length,
      usedItems: scoredItems.length,
    });
     info("rss.fetch.summary", {
     usedItems: scoredItems.length,
    });

    return { items: scoredItems, feedUrl };
  } catch (err) {
    error("rss.fetch.error", { feedUrl, err: String(err) });
    return { items: [], feedUrl };
  }
}
