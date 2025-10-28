/**
 * rewrite-pipeline.js
 * -------------------
 * Full pipeline for the RSS Feed Creator.
 * 1. Loads sources from R2
 * 2. Fetches and parses RSS feeds
 * 3. Rewrites entries via AI (models.js / resilientRequest)
 * 4. Generates a clean XML feed and saves it to R2
 */

import { ensureFeedsLoaded } from "./startup/rss-init.js";
import { fetchFeeds } from "./utils/fetchFeeds.js";
import { generateFeed } from "./utils/feedGenerator.js";
import { rewriteRssFeedItems } from "./utils/models.js"; // ✅ use your OpenRouter system

export async function endToEndRewrite() {
  // 1️⃣ Load all known RSS sources and URLs
  const { feeds, urlFeeds } = await ensureFeedsLoaded();

  // 2️⃣ Fetch all articles from the defined URLs
  const fetchedArticles = await fetchFeeds(urlFeeds);

  // 3️⃣ Rewrite each article using your OpenRouter AI layer
  const rewritten = await rewriteRssFeedItems(fetchedArticles);

  // 4️⃣ Save rewritten feed back to R2
  const r2Result = await generateFeed(rewritten);

  return {
    ok: true,
    itemsProcessed: rewritten.length,
    r2Result,
  };
}
