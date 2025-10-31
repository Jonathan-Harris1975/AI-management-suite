// ============================================================
// 🧠 RSS Feed Creator — AI Rewrite Models
// ============================================================
//
// - Calls OpenRouter via resilientRequest()
// - Uses rss-prompts.js templates
// - Handles null / missing fields gracefully
// - Logs every AI call and failure cleanly
// ============================================================

import { info, error } from "#logger.js";
import { resilientRequest } from "../../shared/utils/ai-service.js";
import { RSS_PROMPTS } from "./rss-prompts.js"; // ✅ Correct import

/**
 * Rewrites a single RSS feed entry using AI.
 * Safely builds the prompt and ensures valid message content.
 */
export async function rewriteArticle(item = {}) {
  try {
    // Defensive normalization
    const title = item?.title?.trim() || "Untitled article";
    const summary = item?.summary?.trim() || "No summary provided.";
    const link = item?.link?.trim() || "";

    // Skip if completely empty
    if (!title && !summary) {
      throw new Error("Invalid feed item — missing title and summary");
    }

    // Build prompts safely
    const systemPrompt =
      RSS_PROMPTS?.system ||
      "You are an AI summarizer that rewrites RSS feed articles into short, human-readable summaries.";

    const userPrompt =
      typeof RSS_PROMPTS?.user === "function"
        ? RSS_PROMPTS.user(title, summary, link)
        : `Summarize the article titled "${title}" in one concise paragraph.\n\n${summary}`;

    const messages = [
      { role: "system", content: String(systemPrompt) },
      { role: "user", content: String(userPrompt) },
    ];

    info("rss-feed-creator.model.call", {
      route: "rssRewrite",
      title: title.slice(0, 80),
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
      itemTitle: item?.title || "Untitled",
      err: err.message,
    });

    // Return a visible placeholder rather than throwing — keeps pipeline alive
    return `⚠️ Rewrite failed: ${err.message}`;
  }
}

/**
 * Rewrites all items in a feed.
 * Continues gracefully even if individual items fail.
 */
export async function rewriteRssFeedItems(feedItems = []) {
  const results = [];

  for (const item of feedItems) {
    // Skip empty items
    if (!item || (!item.title && !item.summary)) continue;

    try {
      const rewritten = await rewriteRssFeedItem(item);
      results.push({ ...item, rewritten });
    } catch (err) {
      error("❌ RSS item rewrite failed", {
        itemTitle: item?.title || "Untitled",
        err: err.message,
      });
      // Still push original item so feed remains complete
      results.push({ ...item, rewritten: `⚠️ Rewrite failed: ${err.message}` });
    }
  }

  info("rss-feed-creator.model.batch.complete", {
    totalItems: feedItems.length,
    rewrittenItems: results.length,
  });

  return results;
}

export default { rewriteRssFeedItems };
