import { info, error } from "../shared/utils/logger.js";
import { rotateFeeds } from "./utils/rotateFeeds.js";
import { fetchFeedsXml } from "./utils/fetchFeeds.js";
import { rewriteRSSFeeds } from "./rewrite-pipeline.js";

const MAX_FEEDS_PER_RUN = Number(process.env.MAX_FEEDS_PER_RUN || 5);

export default async function bootstrapRssFeedCreator() {
  try {
    info("🧠 RSS Feed Creator — bootstrap start");

    const { feeds, site } = await rotateFeeds({ maxFeeds: MAX_FEEDS_PER_RUN });
    info("🔁 Rotation result", { feedsCount: feeds.length, site });

    const sources = [...feeds, ...(site ? [site] : [])];
    if (!sources.length) {
      info("⚠️ No sources to process — exiting");
      return;
    }

    const fetched = await fetchFeedsXml(sources);
    info("🌐 Fetched sources", {
      okCount: fetched.filter((f) => f.ok).length,
      failCount: fetched.filter((f) => !f.ok).length,
    });

    for (const { ok, url, xml, err } of fetched) {
      if (!ok) {
        error("❌ Fetch failed", { url, err });
        continue;
      }

      // use a stable filename suffix per source to avoid collisions in the same run
      const suffix = new URL(url).hostname.replace(/[^a-z0-9.-]/gi, "_");
      const fileName = `feed-rewrite-${suffix}-${new Date().toISOString().replace(/[:.]/g, "-")}.xml`;

      try {
        await rewriteRSSFeeds(xml, {
          fileName,
          maxItemsPerFeed: Number(process.env.MAX_ITEMS_PER_FEED || 20),
        });
      } catch (e) {
        error("💥 Rewrite failed", { url, err: e.message });
      }
    }

    info("✅ RSS Feed Creator — bootstrap complete");
  } catch (e) {
    error("💥 RSS Feed Creator — bootstrap error", { err: e.message });
    throw e;
  }
}

// Allow running directly (node services/rss-feed-creator/index.js)
if (process.argv[1] && process.argv[1].endsWith("index.js")) {
  bootstrapRssFeedCreator().catch(() => process.exit(1));
    }
