// ============================================================
// 🧠 RSS Feed Creator — End-to-End Rewrite Pipeline
// ============================================================
//
// - Fetches source RSS feeds
// - Rewrites + enriches items via AI (rssRewrite + rssShortTitle)
// - Builds and uploads RSS feed to R2
// ============================================================

import { info, error } from "#logger.js";
import { fetchAndParseFeeds } from "./utils/sourceFeeds.js";
import { rewriteRssFeedItems } from "./models.js";
import { generateFeed } from "./utils/feedGenerator.js";

export async function endToEndRewrite() {
  try {
    info("rss-feed-creator.pipeline.start");

    // 1️⃣ Fetch source feeds
    const feedItems = await fetchAndParseFeeds();

    if (!Array.isArray(feedItems) || feedItems.length === 0) {
      info("rss-feed-creator.pipeline.noItems", {
        reason: "No valid items fetched from sources",
      });
      return { totalItems: 0, rewrittenItems: 0 };
    }

    info("rss-feed-creator.pipeline.fetch.complete", {
      items: feedItems.length,
      sampleTitle: feedItems[0]?.title,
    });

    // 2️⃣ Rewrite + enrich feed items (adds shortTitle, shortUrl, rewritten, shortGuid)
    const rewrittenItems = await rewriteRssFeedItems(feedItems);

    if (!Array.isArray(rewrittenItems) || rewrittenItems.length === 0) {
      throw new Error("rewriteRssFeedItems() returned no results");
    }

    // 🧩 Quick sample log to confirm enrichment before feed generation
    const first = rewrittenItems[0];
    info("rss-feed-creator.pipeline.sample", {
      shortTitle: first?.shortTitle,
      shortUrl: first?.shortUrl,
      guid: first?.shortGuid,
      rewritten: !!first?.rewritten,
    });

    info("rss-feed-creator.batch.complete", {
      totalItems: feedItems.length,
      rewrittenItems: rewrittenItems.length,
    });

    // 3️⃣ Generate RSS feed using enriched data
    await safeGenerateFeed("rss", rewrittenItems);

    info("rss-feed-creator.pipeline.done", {
      totalItems: feedItems.length,
      rewrittenItems: rewrittenItems.length,
    });

    return { totalItems: feedItems.length, rewrittenItems: rewrittenItems.length };
  } catch (err) {
    error("rss-feed-creator.pipeline.fail", {
      message: err?.message,
      stack: err?.stack,
    });
    throw err;
  }
}

// ============================================================
// 🔁 Safe feed generator with retry logic
// ============================================================

async function safeGenerateFeed(bucket, items) {
  try {
    await generateFeed(bucket, items);
  } catch (err) {
    error("rss-feed-creator.generateFeed.retry", {
      message: err?.message,
    });

    // Simple one-time retry after 2s delay
    await new Promise((resolve) => setTimeout(resolve, 2000));

    try {
      await generateFeed(bucket, items);
      info("rss-feed-creator.generateFeed.retry.success");
    } catch (retryErr) {
      error("rss-feed-creator.generateFeed.retry.fail", {
        message: retryErr?.message,
      });
      throw retryErr;
    }
  }
}
