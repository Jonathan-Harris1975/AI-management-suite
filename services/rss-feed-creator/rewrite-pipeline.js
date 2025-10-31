/**
 * rewrite-pipeline.js
 * Orchestrates RSS rewriting and feed generation for Turing's Torch.
 */

import { generateFeed } from "./utils/feedGenerator.js";
import { info, error } from "#logger.js";
import { rewriteArticle } from "./utils/models.js";

export async function endToEndRewrite() {
  try {
    info("rss-feed-creator.pipeline.start");

    // Load items for rewriting (from upstream RSS fetch)
    const rssItems = globalThis.__latestFetchedItems || [];
    if (!rssItems.length) {
      info("rss-feed-creator.noSourceItems", { count: 0 });
      return;
    }

    // Rewrite each article
    const rewritten = [];
    for (const item of rssItems) {
      try {
        const rewrittenText = await rewriteArticle(item);
        if (rewrittenText) {
          rewritten.push({
            title: item.title || "Untitled",
            link: item.link || "",
            pubDate: item.pubDate || new Date().toUTCString(),
            guid: item.guid || item.link || crypto.randomUUID(),
            rewritten: rewrittenText,
          });
        }
      } catch (err) {
        error("rss-feed-creator.article.rewrite.fail", err, {
          title: item.title,
        });
      }
    }

    if (!rewritten.length) {
      info("rss-feed-creator.noRewrittenItems", { count: 0 });
      return;
    }

    const bucketName = process.env.R2_BUCKET_RSS_FEEDS || "rss-feeds";

    info("rss-feed-creator.batch.complete", {
      totalItems: rssItems.length,
      rewrittenItems: rewritten.length,
    });

    await generateFeed(bucketName, rewritten);
  } catch (err) {
    error("rss-feed-creator.pipeline.fail", err);
  }
}
