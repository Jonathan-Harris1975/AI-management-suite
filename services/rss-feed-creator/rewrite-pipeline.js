// services/rss-feed-creator/rewrite-pipeline.js
import { info, error } from "#logger.js";
import { rewriteRssFeedItems } from "./models.js";
import { generateFeed } from "./utils/feedGenerator.js";
import { fetchFeeds } from "./utils/fetchFeeds.js"; // whatever you use to load feeds

// Choose the R2 bucket key from env (defaults to "rss" which exists in your r2-client)
const RSS_BUCKET_KEY = process.env.RSS_BUCKET_KEY?.trim() || "rss";

export async function endToEndRewrite() {
  try {
    info("rss-feed-creator.pipeline.start");

    // 1) Pull raw items from your configured sources
    const feedItems = await  fetchFeeds();

    if (!Array.isArray(feedItems) || feedItems.length === 0) {
      info("rss-feed-creator.pipeline.noItems");
      return { totalItems: 0, rewrittenItems: 0 };
    }

    // 2) Rewrite + enrich every item (adds shortTitle, shortUrl, rewritten, shortGuid, pubDate)
    const rewrittenItems = await rewriteRssFeedItems(feedItems);

    // Optional: quick sanity log of the first item so you can see the keys at runtime
    try {
      const first = rewrittenItems?.[0];
      info("rss-feed-creator.pipeline.sample", {
        hasShortTitle: !!first?.shortTitle,
        hasShortUrl: !!first?.shortUrl,
        title: first?.shortTitle || first?.title,
        link: first?.shortUrl || first?.link,
      });
    } catch { /* non-fatal */ }

    info("rss-feed-creator.batch.complete", {
      totalItems: feedItems.length,
      rewrittenItems: rewrittenItems.length,
    });

    // 3) VERY IMPORTANT: Build the RSS from the REWRITTEN items, not the originals
    await generateFeed(RSS_BUCKET_KEY, rewrittenItems);

    info("rss-feed-creator.pipeline.done");
    return { totalItems: feedItems.length, rewrittenItems: rewrittenItems.length };
  } catch (err) {
    error("rss-feed-creator.pipeline.fail", { err: err?.message });
    throw err;
  }
  }
