// ============================================================
// 🧠 RSS Feed Creator — Append + Self-Clean (Single R2 Bucket)
// ============================================================
// - Fetches and rewrites new items
// - Loads existing feed from R2
// - Appends new rewritten items, deduplicates, self-cleans
// - Saves single merged feed XML back to same R2 bucket
// ============================================================

import { info, error } from "#logger.js";
import { getObjectAsText, putText, R2_BUCKETS } from "../../shared/utils/r2-client.js";
import { rewriteRssFeedItems } from "./models.js";
import { fetchFeeds } from "./fetchFeeds.js";
import { buildRssXml, parseExistingRssXml } from "./rssBuilder.js";

const FEED_KEY = "feeds/ai-digest.xml";
const FEED_CUTOFF_DAYS = Number(process.env.FEED_CUTOFF_DAYS) || 60;
const MAX_TOTAL_ITEMS = Number(process.env.MAX_TOTAL_ITEMS) || 500;

export async function generateFeed() {
  try {
    // 1️⃣ Fetch and rewrite new feed items
    const newItems = await fetchFeeds();
    const rewritten = await rewriteRssFeedItems(newItems);

    info("rss.feedGenerator.newItems", { count: rewritten.length });

    // 2️⃣ Try to load existing feed from R2
    let existingItems = [];
    try {
      const xml = await getObjectAsText(R2_BUCKETS.RSS_FEEDS, FEED_KEY);
      existingItems = parseExistingRssXml(xml);
      info("rss.feedGenerator.loadedExisting", { existing: existingItems.length });
    } catch {
      info("rss.feedGenerator.noExistingFeed", { FEED_KEY });
    }

    // 3️⃣ Merge and deduplicate by link
    const allItemsMap = new Map();
    for (const item of [...rewritten, ...existingItems]) {
      if (!item.link) continue;
      if (!allItemsMap.has(item.link)) allItemsMap.set(item.link, item);
    }
    let mergedItems = Array.from(allItemsMap.values());

    // 4️⃣ Filter by rolling date window
    const cutoff = Date.now() - FEED_CUTOFF_DAYS * 24 * 60 * 60 * 1000;
    mergedItems = mergedItems.filter((i) => {
      const d = new Date(i.pubDate || 0).getTime();
      return !isNaN(d) && d >= cutoff;
    });

    // 5️⃣ Sort and trim to max total items
    mergedItems = mergedItems
      .sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate))
      .slice(0, MAX_TOTAL_ITEMS);

    // 6️⃣ Rebuild and save merged feed back to R2
    const finalXml = buildRssXml(mergedItems);
    await putText(R2_BUCKETS.RSS_FEEDS, FEED_KEY, finalXml, "application/xml");

    info("rss.feedGenerator.save.success", {
      feedKey: FEED_KEY,
      totalItems: mergedItems.length,
      newItems: rewritten.length,
      cutoffDays: FEED_CUTOFF_DAYS,
    });

    return {
      feedKey: FEED_KEY,
      totalItems: mergedItems.length,
      newItems: rewritten.length,
      cutoffDays: FEED_CUTOFF_DAYS,
    };
  } catch (err) {
    error("rss.feedGenerator.save.fail", { error: err.message });
    throw err;
  }
                         }
