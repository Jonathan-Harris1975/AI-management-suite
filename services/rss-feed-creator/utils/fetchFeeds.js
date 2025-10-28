// ============================================================
// 🧠 RSS Feed Creator — Append + Self-Clean Feed Generator
// ============================================================
// - Fetches + rewrites new feed items
// - Appends to existing RSS XML feed stored in R2
// - Deduplicates + trims to 60 days (configurable)
// ============================================================

import { info, error } from "#logger.js";
import { getObjectAsText, putText, putJson, R2_BUCKETS } from "../../shared/utils/r2-client.js";
import { rewriteRssFeedItems } from "./models.js";
import { fetchFeeds } from "./fetchFeeds.js";
import { buildRssXml, parseExistingRssXml } from "./rssBuilder.js";

const FEED_KEY = "feeds/ai-digest.xml";
const META_KEY = "feeds/ai-digest-meta.json";
const FEED_CUTOFF_DAYS = Number(process.env.FEED_CUTOFF_DAYS) || 60;
const MAX_TOTAL_ITEMS = Number(process.env.MAX_TOTAL_ITEMS) || 500;

export async function generateFeed() {
  try {
    // 1️⃣ Fetch and rewrite new items
    const newItems = await fetchFeeds();
    const rewritten = await rewriteRssFeedItems(newItems);

    info("rss.feedGenerator.newItems", { count: rewritten.length });

    // 2️⃣ Try loading existing feed XML from R2
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

    // 4️⃣ Filter by date (rolling window)
    const cutoff = Date.now() - FEED_CUTOFF_DAYS * 24 * 60 * 60 * 1000;
    mergedItems = mergedItems.filter((i) => {
      const d = new Date(i.pubDate || 0).getTime();
      return !isNaN(d) && d >= cutoff;
    });

    // 5️⃣ Limit total feed size
    mergedItems = mergedItems
      .sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate))
      .slice(0, MAX_TOTAL_ITEMS);

    // 6️⃣ Rebuild feed XML + save to R2
    const finalXml = buildRssXml(mergedItems);
    await putText(R2_BUCKETS.RSS_FEEDS, FEED_KEY, finalXml, "application/xml");

    // 7️⃣ Update metadata
    const meta = {
      totalItems: mergedItems.length,
      newItems: rewritten.length,
      updatedAt: new Date().toISOString(),
      cutoffDays: FEED_CUTOFF_DAYS,
      bucket: R2_BUCKETS.RSS_FEEDS,
    };
    await putJson(R2_BUCKETS.META, META_KEY, meta);

    info("rss.feedGenerator.append.success", meta);

    return { feedKey: FEED_KEY, metaKey: META_KEY, ...meta };
  } catch (err) {
    error("rss.feedGenerator.append.fail", { error: err.message });
    throw err;
  }
       }
