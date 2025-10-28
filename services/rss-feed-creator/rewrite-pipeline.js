/**
 * rewrite-pipeline.js
 * -------------------
 * Full pipeline for the RSS Feed Creator.
 * 1. Loads sources from R2
 * 2. Fetches and parses RSS feeds
 * 3. Rewrites entries via AI (models.js / OpenRouter)
 * 4. Optionally shortens URLs using Short.io
 * 5. Generates RSS XML and saves it to R2
 */

import { ensureFeedsLoaded } from "./startup/rss-init.js";
import { fetchFeeds } from "./utils/fetchFeeds.js";
import { rewriteRssFeedItems } from "./utils/models.js";
import { generateFeed } from "./utils/feedGenerator.js";
import { shortenUrl } from "./utils/shortio.js"; // ✅ integrate Short.io

export async function endToEndRewrite() {
  // 1️⃣ Load sources from R2
  const { feeds, urlFeeds } = await ensureFeedsLoaded();

  // 2️⃣ Fetch content from all configured feeds
  const fetchedArticles = await fetchFeeds(urlFeeds);

  // 3️⃣ Rewrite content using OpenRouter AI via models.js
  const rewritten = await rewriteRssFeedItems(fetchedArticles);

  // 4️⃣ Optionally shorten article URLs via Short.io
  const rewrittenWithShortLinks = [];
  for (const item of rewritten) {
    try {
      const shortLink = await shortenUrl(item.link);
      rewrittenWithShortLinks.push({
        ...item,
        shortLink: shortLink || item.link,
      });
    } catch {
      rewrittenWithShortLinks.push(item);
    }
  }

  // 5️⃣ Generate feed XML and persist to R2
  const r2Result = await generateFeed(rewrittenWithShortLinks);

  return {
    ok: true,
    itemsProcessed: rewrittenWithShortLinks.length,
    r2Result,
  };
}
