// services/rss-feed-creator/utils/models.js
import { info, error } from "#logger.js";
import { resilientRequest } from "../../shared/utils/ai-service.js";
import { RSS_PROMPTS } from "./rss-prompts.js" // ✅ Correct import
/**
 * Rewrites RSS feed entries into concise summaries using AI.
 * Uses the prompt templates defined in rssPrompts.js.
 */
export async function rewriteRssFeedItem(item) {
  try {
    const { title, summary, link } = item;

    const systemPrompt = RSS_PROMPTS.system;
    const userPrompt = RSS_PROMPTS.user(title, summary, link);

    const messages = [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ];

    info("rss-feed-creator.model.call", {
      route: "rssRewrite",
      messagesCount: messages.length,
    });

    const result = await resilientRequest("rssRewrite", { messages });

    if (!result || typeof result !== "string") {
      throw new Error("Empty or invalid AI response");
    }

    return result.trim();
  } catch (err) {
    error("rss-feed-creator.model.fail", {
      route: "rssRewrite",
      err: err.message,
    });
    throw err;
  }
}

/**
 * Rewrites all items in a feed.
 */
export async function rewriteRssFeedItems(feedItems = []) {
  const results = [];

  for (const item of feedItems) {
    try {
      const rewritten = await rewriteRssFeedItem(item);
      results.push({
        ...item,
        rewritten,
      });
    } catch (err) {
      error("❌ RSS item rewrite failed", {
        itemTitle: item?.title || "Untitled",
        err: err.message,
      });
    }
  }

  return results;
}

export default { rewriteRssFeedItems };
