/**
 * rewrite-pipeline.js
 * -------------------
 * Full pipeline for the RSS Feed Creator.
 * 1. Load source lists from R2
 * 2. Fetch and parse the upstream feeds
 * 3. Rewrite entries via AI (OpenRouter through resilientRequest)
 * 4. Shorten URLs (Short.io)
 * 5. Generate final RSS XML and upload to R2
 */

import { ensureFeedsLoaded } from "./startup/rss-init.js";
import { fetchFeeds } from "./utils/fetchFeeds.js";
import { rewriteRssFeedItems } from "./utils/models.js";
import { shortenUrl } from "./utils/shortio.js";
import { generateFeed } from "./utils/feedGenerator.js";

export async function endToEndRewrite() {
  // 1. Get configured feed sources / URLs from R2
  const { urlFeeds } = await ensureFeedsLoaded();

  // 2. Pull latest articles from those feeds
  const fetchedArticles = await fetchFeeds(urlFeeds);
  // fetchedArticles should look like:
  // [{ title, summary, link, pubDate?, source? }, ...]

  // 3. Rewrite each article using AI
  const rewrittenArticles = await rewriteRssFeedItems(fetchedArticles);
  // rewrittenArticles -> [{ ...original, rewritten }, ...]

  // 4. Shorten links (non-blocking: fallback to original link if Short.io fails)
  const withShortLinks = [];
  for (const article of rewrittenArticles) {
    let shortLink = null;
    try {
      shortLink = await shortenUrl(article.link);
    } catch (_) {
      // swallow shortener errors, continue
    }
    withShortLinks.push({
      ...article,
      shortLink: shortLink || article.link,
    });
  }

  // 5. Build the final RSS XML feed and upload it to R2
  const r2Result = await generateFeed(withShortLinks);

  return {
    ok: true,
    itemsProcessed: withShortLinks.length,
    r2Result,
  };
}
