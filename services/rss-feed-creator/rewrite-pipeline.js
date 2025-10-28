/**
 * rewrite-pipeline.js
 * -------------------
 * Full pipeline for the RSS Feed Creator.
 * 1. Fetch and parse upstream feeds
 * 2. Rewrite entries via AI (OpenRouter through resilientRequest)
 * 3. Shorten URLs (Short.io)
 * 4. Generate final RSS XML and upload to R2
 */

import { fetchFeeds } from "./utils/fetchFeeds.js";
import { rewriteRssFeedItems } from "./utils/models.js";
import { shortenUrl } from "./utils/shortio.js";
import { generateFeed } from "./utils/feedGenerator.js";

export async function endToEndRewrite() {
  // 1️⃣ Fetch articles from all configured feeds
  // NOTE: Feeds and URLs are preloaded at startup
  const fetchedArticles = await fetchFeeds();
  // fetchedArticles -> [{ title, summary, link, pubDate?, source? }, ...]

  // 2️⃣ Rewrite each article using AI via OpenRouter (resilientRequest)
  const rewrittenArticles = await rewriteRssFeedItems(fetchedArticles);

  // 3️⃣ Shorten URLs (non-blocking, fallback to original link if failure)
  const withShortLinks = [];
  for (const article of rewrittenArticles) {
    let shortLink = null;
    try {
      shortLink = await shortenUrl(article.link);
    } catch (_) {
      // continue without breaking
    }
    withShortLinks.push({
      ...article,
      shortLink: shortLink || article.link,
    });
  }

  // 4️⃣ Generate the final RSS feed XML and upload to R2
  const r2Result = await generateFeed(withShortLinks);

  return {
    ok: true,
    itemsProcessed: withShortLinks.length,
    r2Result,
  };
}
