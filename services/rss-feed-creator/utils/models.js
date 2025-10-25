// services/rss/utils/rssModel.js
import { info, error } from "#logger.js";
import { resilientRequest } from "../../shared/utils/ai-service.js";
import { buildRssMessages } from "./rssPrompt.js";

/**
 * Handles rewriting RSS items via AI.
 * The prompt creation is handled in rssPrompt.js.
 */
export async function rewriteFeedItem(item) {
  try {
    const messages = buildRssMessages(item); // ✅ handled by rssPrompt
    info("rss.model.call", { route: "rssRewrite", messagesCount: messages.length });

    // ✅ Ensure correct call signature
    const rewritten = await resilientRequest("rssRewrite", { messages });
    return rewritten?.trim() || "";
  } catch (err) {
    error("rss.model.fail", { route: "rssRewrite", err: err.message });
    throw err;
  }
}

/**
 * Batch rewrite all feed items
 */
export async function rewriteFeedItems(feedItems = []) {
  const results = [];

  for (const item of feedItems) {
    try {
      const rewritten = await rewriteFeedItem(item);
      results.push({ ...item, rewritten });
    } catch (err) {
      error("❌ Item rewrite failed", {
        itemTitle: item?.title,
        err: err.message,
      });
    }
  }

  return results;
}

export default { rewriteFeedItems };
