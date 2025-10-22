// ============================================================
// 🧠 RSS Feed Creator — Simplified Index
// ============================================================
// Cleaned up to remove redundant bootstrap steps:
// - Removed ensureR2Sources (handled in rss-bootstrap.js)
// - Removed rotateFeeds (rotation handled dynamically at runtime)
// Keeps only feed fetching and rewrite functionality
// ============================================================

import { info, error } from "#logger.js";
import { fetchFeedsXml } from "./utils/fetchFeeds.js";
import { rewriteRSSFeeds } from "./rewrite-pipeline.js";

const MAX_FEEDS_PER_RUN = Number(process.env.MAX_FEEDS_PER_RUN || 5);

/**
 * Optional standalone task to fetch and rewrite up to MAX_FEEDS_PER_RUN feeds.
 * Normally not needed during container bootstrap (rss-bootstrap.js covers R2 setup).
 */
export default async function bootstrapRssFeedCreator() {
  try {
    info("🧠 RSS Feed Creator — simplified bootstrap start");

    // Load feed URLs from environment or static list if needed
    const rawList = process.env.FEED_URLS || "";
    const feeds = rawList
      .split(/[\n,]/)
      .map(f => f.trim())
      .filter(Boolean)
      .slice(0, MAX_FEEDS_PER_RUN);

    if (!feeds.length) {
      info("⚠️ No feed URLs provided via FEED_URLS — nothing to rewrite.");
      return;
    }

    info(`🌐 Fetching up to ${feeds.length} feeds for rewrite...`);
    const fetched = await fetchFeedsXml(feeds);
    const okFeeds = fetched.filter(f => f.ok);

    info("✅ Fetch results", {
      okCount: okFeeds.length,
      failCount: fetched.length - okFeeds.length,
    });

    // Run rewrite pipeline for each successfully fetched feed
    for (const { url, xml } of okFeeds) {
      const suffix = new URL(url).hostname.replace(/[^a-z0-9.-]/gi, "_");
      const fileName = `feed-${suffix}-${Date.now()}.xml`;
      try {
        await rewriteRSSFeeds(xml, { fileName });
        info(`✍️ Rewrote RSS feed: ${url}`);
      } catch (err) {
        error("💥 Rewrite failed for feed", { url, err: err.message });
      }
    }

    info("✅ RSS Feed Creator — simplified bootstrap complete");
  } catch (err) {
    error("💥 RSS Feed Creator bootstrap error", { err: err.message });
  }
}

// ✅ Allow manual execution via CLI (node services/rss-feed-creator/index.js)
if (process.argv[1] && process.argv[1].endsWith("index.js")) {
  bootstrapRssFeedCreator().catch(() => process.exit(1));
}
