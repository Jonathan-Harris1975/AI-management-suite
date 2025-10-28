// ============================================================
// 🧠 RSS Feed Generator — Append + 60-Day Rolling Cleanup
// ============================================================

import { info, error } from "#logger.js";
import { getObjectAsText, putText, R2_BUCKETS } from "../../shared/utils/r2-client.js";
import { rewriteRssFeedItems } from "./models.js";
import { fetchFeeds } from "./fetchFeeds.js";
import { buildRssXml, parseExistingRssXml } from "./rssBuilder.js";

const FEED_KEY = "feeds/ai-digest.xml";
const FEED_RETENTION_DAYS = Number(process.env.FEED_RETENTION_DAYS) || 60;
const MAX_TOTAL_ITEMS = Number(process.env.MAX_TOTAL_ITEMS) || 500;

export async function generateFeed() {
  try {
    // 1️⃣ Fetch fresh (<24h) items
    const newItems = await fetchFeeds();
    
    // Validate fetched items
    if (!Array.isArray(newItems)) {
      throw new Error("fetchFeeds did not return an array");
    }

    const rewritten = await rewriteRssFeedItems(newItems);
    
    // Validate rewritten items
    if (!Array.isArray(rewritten)) {
      throw new Error("rewriteRssFeedItems did not return an array");
    }

    info("rss.feedGenerator.newItems", { count: rewritten.length });

    // 2️⃣ Load existing feed XML from R2
    let existingItems = [];
    try {
      const xml = await getObjectAsText(R2_BUCKETS.RSS_FEEDS, FEED_KEY);
      existingItems = parseExistingRssXml(xml);
      
      // Validate parsed items
      if (!Array.isArray(existingItems)) {
        error("rss.feedGenerator.invalidParsedData", { 
          type: typeof existingItems 
        });
        existingItems = [];
      }
      
      info("rss.feedGenerator.loadedExisting", { 
        existing: existingItems.length 
      });
    } catch (err) {
      info("rss.feedGenerator.noExistingFeed", { 
        FEED_KEY,
        reason: err.message 
      });
    }

    // 3️⃣ Merge and deduplicate by link
    const allItemsMap = new Map();
    for (const item of [...rewritten, ...existingItems]) {
      // Skip items without required fields
      if (!item?.link || typeof item.link !== 'string') continue;
      
      // Prioritize newer items (rewritten comes first)
      if (!allItemsMap.has(item.link)) {
        allItemsMap.set(item.link, item);
      }
    }
    let mergedItems = Array.from(allItemsMap.values());

    // 4️⃣ Retain only items within retention period
    const cutoffMs = Date.now() - FEED_RETENTION_DAYS * 24 * 60 * 60 * 1000;
    mergedItems = mergedItems.filter((item) => {
      if (!item.pubDate) return false;
      
      const itemDate = new Date(item.pubDate).getTime();
      
      // Filter out invalid dates and items older than cutoff
      return !isNaN(itemDate) && itemDate >= cutoffMs;
    });

    info("rss.feedGenerator.afterRetention", { 
      items: mergedItems.length,
      cutoffDate: new Date(cutoffMs).toISOString()
    });

    // 5️⃣ Sort by date (newest first) and limit feed size
    mergedItems = mergedItems
      .sort((a, b) => {
        const dateA = new Date(a.pubDate || 0).getTime();
        const dateB = new Date(b.pubDate || 0).getTime();
        
        // Handle invalid dates by pushing them to the end
        if (isNaN(dateA)) return 1;
        if (isNaN(dateB)) return -1;
        
        return dateB - dateA; // Newest first
      })
      .slice(0, MAX_TOTAL_ITEMS);

    // 6️⃣ Build & upload updated feed
    const finalXml = buildRssXml(mergedItems);
    await putText(R2_BUCKETS.RSS_FEEDS, FEED_KEY, finalXml, "application/xml");

    info("rss.feedGenerator.save.success", {
      feedKey: FEED_KEY,
      totalItems: mergedItems.length,
      newItems: rewritten.length,
      retentionDays: FEED_RETENTION_DAYS,
      maxItems: MAX_TOTAL_ITEMS,
    });

    return {
      feedKey: FEED_KEY,
      totalItems: mergedItems.length,
      newItems: rewritten.length,
      retentionDays: FEED_RETENTION_DAYS,
    };
  } catch (err) {
    error("rss.feedGenerator.save.fail", { 
      error: err.message,
      stack: err.stack 
    });
    throw err;
  }
}
