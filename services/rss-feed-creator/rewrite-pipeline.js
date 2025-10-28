/**
 * RSS Feed Rewriter Pipeline
 * --------------------------
 * Fetches live feeds, rewrites them using AI prompt rules,
 * and regenerates the final feed for storage in R2.
 *
 * This module is fully self-contained and does not use sessionId.
 */

import { ensureFeedsLoaded } from "./startup/rss-init.js";
import { fetchFeeds } from "./utils/fetchFeeds.js";
import { generateFeed } from "./utils/feedGenerator.js";
import * as prompts from "./utils/rss-prompts.js";

/**
 * Pull feeds, rewrite with AI, and save to R2
 */
export async function endToEndRewrite() {
  // 1️⃣ Ensure feed sources are ready (R2 cache or bootstrap)
  const { feeds, urlFeeds } = await ensureFeedsLoaded();

  // 2️⃣ Fetch the articles from URLs
  const articles = await fetchFeeds(urlFeeds);

  // 3️⃣ Rewrite titles + summaries using your AI prompt style
  const rewritten = [];
  for (const item of articles) {
    const content = `${item.title}\n\n${item.summary || ""}`;
    const rewrittenText = await prompts.rewriteWithAI(content);
    rewritten.push({
      ...item,
      rewritten: rewrittenText,
    });
  }

  // 4️⃣ Regenerate an updated RSS feed and save it to R2
  const r2Result = await generateFeed(rewritten);

  return {
    ok: true,
    count: rewritten.length,
    r2Result,
  };
}
