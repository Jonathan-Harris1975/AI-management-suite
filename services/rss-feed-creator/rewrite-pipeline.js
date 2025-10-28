import { ensureFeedsLoaded } from "./startup/rss-init.js";
import { rewriteArticlesWithAI } from "./rewriteFeedItems.js";
import { saveRewrittenFeedToR2 } from "./saveRewrittenFeed.js";
import * as prompts from "./utils/rss-prompts.js";

/**
 * endToEndRewrite()
 * 1. Make sure feeds exist in R2
 * 2. Pull latest feed items
 * 3. Rewrite with AI using tone rules
 * 4. Save rewritten output to R2
 *
 * NOTE: This pipeline is independent from podcast session logic.
 */
export async function endToEndRewrite() {
  const { feeds, urlFeeds } = await ensureFeedsLoaded();

  const rewritten = await rewriteArticlesWithAI({
    feeds,
    urlFeeds,
    systemPrompt: prompts.systemPrompt,
    itemPrompt: prompts.itemPrompt,
  });

  const r2Result = await saveRewrittenFeedToR2(rewritten);

  return {
    ok: true,
    count: rewritten?.items?.length || 0,
    r2Result,
  };
}
