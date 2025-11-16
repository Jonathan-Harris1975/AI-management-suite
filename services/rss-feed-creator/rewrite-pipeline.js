// ============================================================
// 🧠 RSS Feed Creator — End-to-End Rewrite Pipeline (Shiper)
// ============================================================
//
// Uses the ACTUAL file names from your repo:
//  - ./utils/fetchFeeds.js
//  - ./utils/models.js
//  - ./utils/feedGenerator.js
//
// Ensures the enriched array (rewrittenItems) is used to build the feed.
// Adds clear preview logging and a one-shot retry on upload.
// ============================================================

import { error } from "#logger.js";
import { fetchAndParseFeeds } from "./utils/fetchFeeds.js";
import { rewriteRssFeedItems } from "./utils/models.js";
import { generateFeed } from "./utils/feedGenerator.js";
import { rssLogger } from "./utils/rss-logger.js";

export async function endToEndRewrite() {
  rssLogger.startSession();
  
  try {
    // 1) Fetch source items
    const feedItems = await fetchAndParseFeeds();
    if (!Array.isArray(feedItems) || feedItems.length === 0) {
      rssLogger.addWarning("No valid items found in feeds");
      rssLogger.endSession();
      return { totalItems: 0, rewrittenItems: 0 };
    }

    // 2) Rewrite + enrich (adds shortTitle, shortUrl, rewritten, shortGuid, pubDate)
    const rewrittenItems = await rewriteRssFeedItems(feedItems);
    if (!Array.isArray(rewrittenItems) || rewrittenItems.length === 0) {
      rssLogger.addWarning("Rewrite process returned no results");
      rssLogger.endSession();
      return { totalItems: feedItems.length, rewrittenItems: 0 };
    }

    // Preview the first enriched item to confirm correct fields
    const first = rewrittenItems[0] || {};
    rssLogger.addWarning(`Sample item - Title: "${first.shortTitle}", URL: ${first.shortUrl}, Has Content: ${!!first.rewritten}`);

    // 3) Build + upload RSS using the ENRICHED array (not the originals)
    await safeGenerateFeed("rss", rewrittenItems);

    rssLogger.endSession();
    
    return { 
      totalItems: feedItems.length, 
      rewrittenItems: rewrittenItems.length 
    };
  } catch (err) {
    rssLogger.trackItemRewrite(false, `Pipeline failure: ${err.message}`);
    rssLogger.endSession();
    error("rss-feed-creator.pipeline.fail", { 
      message: err?.message, 
      stack: err?.stack 
    });
    throw err;
  }
}

// ------------------------------------------------------------
// 🔁 Safe feed generation with one retry
// ------------------------------------------------------------
async function safeGenerateFeed(bucket, items) {
  try {
    if (items?.[0]) {
      rssLogger.addWarning(`Feed preview - First item: "${items[0]?.shortTitle || items[0]?.title}"`);
    }

    await generateFeed(bucket, items);
  } catch (err) {
    rssLogger.trackUpload(false, { 
      bucket, 
      error: err.message,
      items: items.length 
    });

    // retry once after 2s
    await new Promise((r) => setTimeout(r, 2000));
    await generateFeed(bucket, items);
    rssLogger.addWarning("Feed generation succeeded on retry");
  }
}
