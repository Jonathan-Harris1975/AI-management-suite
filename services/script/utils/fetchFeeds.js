// services/script/utils/fetchFeeds.js
import Parser from "rss-parser";
import fetch from "node-fetch";
import { info, error } from "#logger.js";

const parser = new Parser();

// ─────────────────────────────────────────────────────────────
// 🧠 Score article quality
// ─────────────────────────────────────────────────────────────
function calculateArticleScore(item) {
  let score = 0;
  if (item.title) {
    const titleLength = item.title.length;
    if (titleLength > 20 && titleLength < 120) score += 3;
    else if (titleLength >= 10) score += 1;
  }
  if (item.contentSnippet && item.contentSnippet.length > 100) score += 2;

  const dateValue = item.pubDate || item.isoDate || item.published;
  if (dateValue) {
    const pubDate = new Date(dateValue);
    const daysOld = (Date.now() - pubDate.getTime()) / (1000 * 60 * 60 * 24);
    if (daysOld < 1) score += 3;
    else if (daysOld < 3) score += 2;
    else if (daysOld < 7) score += 1;
  }
  return score;
}

// ─────────────────────────────────────────────────────────────
// 🧩 Robust RSS / Atom / JSON Feed Parser
// ─────────────────────────────────────────────────────────────
export default async function fetchFeedArticles(feedUrlArg, targetDuration = 60) {
  const feedUrl = feedUrlArg?.trim() || process.env.FEED_URL?.trim();

  if (!feedUrl) {
    error("❌ No FEED_URL provided — check your environment variables or function call.");
    return { items: [], feedUrl: null };
  }

  try {
    info("📡 Fetching RSS feed", { feedUrl });

    const res = await fetch(feedUrl);
    if (!res.ok) throw new Error(`Fetch failed: ${res.status} ${res.statusText}`);
    const text = await res.text();

    let feed;
    try {
      feed = await parser.parseString(text);
    } catch {
      if (text.includes("<feed")) {
        const matchTitles = [...text.matchAll(/<title>(.*?)<\/title>/g)].map((m) => m[1]);
        const matchLinks = [...text.matchAll(/<link[^>]*href="([^"]+)"/g)].map((m) => m[1]);
        feed = {
          title: matchTitles[0] || "Untitled Feed",
          items: matchTitles.slice(1).map((t, i) => ({
            title: t,
            link: matchLinks[i + 1] || "",
            contentSnippet: "",
          })),
        };
      } else if (text.trim().startsWith("{")) {
        const json = JSON.parse(text);
        feed = json?.items ? json : { title: "Invalid Feed", items: [] };
      } else {
        throw new Error("Feed not recognized as RSS, Atom, or JSON");
      }
    }

    const scoredItems = (feed.items || [])
      .map((item) => ({ ...item, score: calculateArticleScore(item) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 10);

    info(`✅ Parsed ${scoredItems.length} items from feed.`, { feedUrl });
    return { items: scoredItems, feedUrl };
  } catch (err) {
    error("❌ Error fetching or parsing RSS feed", { message: err.message, feedUrl });
    return { items: [], feedUrl };
  }
}
