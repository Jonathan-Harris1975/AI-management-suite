/**
 * rewrite-pipeline.js
 * Orchestrates RSS rewriting and feed generation for Turing's Torch.
 */

import { generateFeed } from "./utils/feedGenerator.js";
import { logInfo, logError } from "../shared/utils/logger.js";
import { rewriteArticle } from "./model/rewriteArticle.js";

export async function endToEndRewrite() {
  try {
    logInfo("rss-feed-creator.pipeline.start");

    // Load items for rewriting (from upstream RSS fetch)
    const rssItems = globalThis.__latestFetchedItems || [];
    if (!rssItems.length) {
      logInfo("rss-feed-creator.noSourceItems", { count: 0 });
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
        logError("rss-feed-creator.article.rewrite.fail", err, {
          title: item.title,
        });
      }
    }

    if (!rewritten.length) {
      logInfo("rss-feed-creator.noRewrittenItems", { count: 0 });
      return;
    }

    const bucketName = process.env.R2_BUCKET_RSS_FEEDS || "rss-feeds";

    logInfo("rss-feed-creator.batch.complete", {
      totalItems: rssItems.length,
      rewrittenItems: rewritten.length,
    });

    await generateFeed(bucketName, rewritten);
  } catch (err) {
    logError("rss-feed-creator.pipeline.fail", err);
  }
}
