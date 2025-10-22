// services/rss-feed-creator/index.js
import { info, error } from "#logger.js";
import { ensureR2Sources } from "./utils/rss-bootstrap.js";
import { rotateFeeds } from "./utils/rotateFeeds.js";
import { fetchFeedsXml } from "./utils/fetchFeeds.js";
import { rewriteRSSFeeds } from "./rewrite-pipeline.js";

const MAX_FEEDS_PER_RUN = Number(process.env.MAX_FEEDS_PER_RUN || 5);

/**
 * Bootstrap job that ensures R2 has all sources and optionally rewrites the first feed.
 */
export default async function bootstrapRssFeedCreator() {
  try {
    info("🧠 RSS Feed Creator — bootstrap start");

    // 🪣 Make sure the real feeds and URLs exist both locally and in R2
    const { bucket, feeds, urls, rotation } = await ensureR2Sources();

    info("✅ Verified R2 sources", {
      bucket,
      feedsCount: feeds.length,
      urlsCount: urls.length,
    });

    // Optionally prefetch and rewrite one or more feeds (for warmup)
    const { feeds: rotationFeeds } = await rotateFeeds({
      feeds,
      rotation,
      maxFeeds: MAX_FEEDS_PER_RUN,
    });

    info(`🔁 Selected ${rotationFeeds.length} feed(s) for initial rewrite.`);

    const fetched = await fetchFeedsXml(rotationFeeds);
    const okFeeds = fetched.filter(f => f.ok);

    info("🌐 Fetched initial feeds", {
      okCount: okFeeds.length,
      failCount: fetched.length - okFeeds.length,
    });

    for (const { url, xml, ok } of okFeeds) {
      if (!ok) continue;
      const suffix = new URL(url).hostname.replace(/[^a-z0-9.-]/gi, "_");
      const fileName = `feed-${suffix}-${Date.now()}.xml`;
      await rewriteRSSFeeds(xml, { fileName });
      info(`✍️ Rewrote RSS feed: ${url}`);
    }

    info("✅ RSS Feed Creator — bootstrap complete");
  } catch (err) {
    error("💥 RSS Feed Creator bootstrap error", { err: err.message });
  }
}

// ✅ Allow manual execution via CLI
if (process.argv[1] && process.argv[1].endsWith("index.js")) {
  bootstrapRssFeedCreator().catch(() => process.exit(1));
}
