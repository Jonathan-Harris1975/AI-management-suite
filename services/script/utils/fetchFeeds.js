// services/script/utils/fetchFeeds.js
import Parser from "rss-parser";
import fetch from "node-fetch";
import { info, error, debug} from "#logger.js";

const parser = new Parser();

function withinDays(dateValue, days=7) {
  if (!dateValue) return false;
  const pubDate = new Date(dateValue);
  if (isNaN(pubDate.getTime())) return false;
  const diffDays = (Date.now() - pubDate.getTime()) / (1000 * 60 * 60 * 24);
  return diffDays <= days;
}

function calculateArticleScore(item) {
  let score = 0;
  if (item.title) {
    const tl = item.title.length;
    if (tl > 20 && tl < 120) score += 3;
    else if (tl >= 10) score += 1;
  }
  const snippet = item.contentSnippet || item.summary || item.description || "";
  if (snippet.length > 100) score += 2;

  const dateValue = item.pubDate || item.isoDate || item.published;
  if (withinDays(dateValue, 1)) score += 3;
  else if (withinDays(dateValue, 3)) score += 2;
  else if (withinDays(dateValue, 7)) score += 1;

  return score;
}

/**
 * Fetches RSS/Atom/JSON feed and returns all items from the last 7 days,
 * scored and sorted (desc), with no artificial cap.
 * Returns: { items, feedUrl }
 */
export default async function fetchFeedArticles(feedUrlArg, windowDays = 7) {
  const feedUrl = feedUrlArg?.trim() || process.env.FEED_URL?.trim();

  if (!feedUrl) {
    error("❌ No FEED_URL provided — set FEED_URL in environment or pass as arg.");
    return { items: [], feedUrl: null };
  }

  try {
    debug("📡 Fetching RSS feed", { feedUrl });
    const res = await fetch(feedUrl);
    if (!res.ok) throw new Error(`Fetch failed: ${res.status} ${res.statusText}`);
    const text = await res.text();

    let feed;
    try {
      feed = await parser.parseString(text);
    } catch {
      if (text.includes("<feed")) {
        // Minimal Atom fallback
        const matchTitles = [...text.matchAll(/<title>(.*?)<\/title>/g)].map(m => m[1]);
        const matchLinks = [...text.matchAll(/<link[^>]*href="([^"]+)"/g)].map(m => m[1]);
        feed = {
          title: matchTitles[0] || "Untitled Feed",
          items: matchTitles.slice(1).map((t, i) => ({
            title: t, link: matchLinks[i + 1] || "", contentSnippet: ""
          })),
        };
      } else if (text.trim().startsWith("{")) {
        const json = JSON.parse(text);
        feed = json?.items ? json : { title: "Invalid Feed", items: [] };
      } else {
        throw new Error("Feed not recognized as RSS, Atom, or JSON");
      }
    }

    const allItems = (feed.items || []);
    const recent = allItems.filter(it => withinDays(it.pubDate || it.isoDate || it.published, windowDays));

    const scoredItems = recent
      .map(item => ({ ...item, score: calculateArticleScore(item) }))
      .sort((a, b) => b.score - a.score);

    debug(`✅ Parsed ${scoredItems.length} items from feed (last ${windowDays} days).`, { feedUrl });
    return { items: scoredItems, feedUrl };
  } catch (err) {
    error("❌ Error fetching or parsing RSS feed", { message: err.message, feedUrl });
    return { items: [], feedUrl };
  }
}
