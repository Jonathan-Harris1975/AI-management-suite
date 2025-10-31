// ============================================================
// 🧠 RSS Feed Creator — AI Rewrite Models (Enhanced)
// ============================================================
//
// - Rewrites RSS items via resilientRequest()
// - Generates short branded titles
// - Uses Short.io for link shortening
// - Adds ai-news prefixed GUIDs
// ============================================================

import crypto from "crypto";
import { info, error } from "#logger.js";
import { resilientRequest } from "../../shared/utils/ai-service.js";
import { RSS_PROMPTS } from "./rss-prompts.js";
import { shortenUrl } from "./utils/shortio.js";

/**
 * Generate a concise, branded short title for the article.
 */
async function generateShortTitle(title = "", summary = "") {
  try {
    const systemPrompt =
      "You are an editorial assistant that creates short, catchy titles for AI news items. Keep it under 10 words, no punctuation at the end.";
    const userPrompt = `Create a short, branded title for this article:\n\nTitle: ${title}\n\nSummary: ${summary}`;

    const messages = [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ];

    const shortTitle = await resilientRequest("rssShortTitle", { messages });

    if (!shortTitle || typeof shortTitle !== "string") {
      throw new Error("Empty short title");
    }

    return shortTitle.trim().replace(/^["']|["']$/g, "");
  } catch (err) {
    error("rss-feed-creator.shortTitle.fail", { err: err.message });
    return title.slice(0, 60); // fallback: truncate original
  }
}

/**
 * Rewrites a single RSS feed entry using AI and enriches it.
 */
export async function rewriteArticle(item = {}) {
  try {
    const title = item?.title?.trim() || "Untitled article";
    const summary = item?.summary?.trim() || "No summary provided.";
    const link = item?.link?.trim() || "";

    if (!title && !summary) {
      throw new Error("Invalid feed item — missing title and summary");
    }

    // ======================================================
    // 🔹 1. Rewrite the article (main summary)
    // ======================================================
    const systemPrompt =
      RSS_PROMPTS?.system ||
      "You are an AI summarizer that rewrites RSS feed articles into short, human-readable summaries.";

    const userPrompt =
      typeof RSS_PROMPTS?.user === "function"
        ? RSS_PROMPTS.user(title, summary, link)
        : `Summarize the article titled "${title}" in one concise paragraph.\n\n${summary}`;

    const rewriteMessages = [
      { role: "system", content: String(systemPrompt) },
      { role: "user", content: String(userPrompt) },
    ];

    const rewritten = await resilientRequest("rssRewrite", { messages: rewriteMessages });

    // ======================================================
    // 🔹 2. Generate short title
    // ======================================================
    const shortTitle = await generateShortTitle(title, summary);

    // ======================================================
    // 🔹 3. Shorten URL using Short.io
    // ======================================================
    const shortUrl = await shortenUrl(link);

    // ======================================================
    // 🔹 4. Generate ai-news GUID
    // ======================================================
    const shortGuid = `ai-news-${crypto.randomBytes(5).toString("hex")}`;

    info("rss-feed-creator.model.success", {
      route: "rssRewrite",
      title: shortTitle,
      shortUrl,
      guid: shortGuid,
    });

    // ======================================================
    // 🔹 5. Return enriched item
    // ======================================================
    return {
      ...item,
      rewritten: rewritten?.trim() || "No summary generated.",
      shortTitle,
      shortUrl,
      shortGuid,
      pubDate: new Date().toUTCString(),
    };
  } catch (err) {
    error("rss-feed-creator.model.fail", {
      route: "rssRewrite",
      itemTitle: item?.title || "Untitled",
      err: err.message,
    });

    return {
      ...item,
      rewritten: `⚠️ Rewrite failed: ${err.message}`,
      shortTitle: item?.title || "Untitled",
      shortUrl: item?.link || "",
      shortGuid: `ai-news-${crypto.randomBytes(5).toString("hex")}`,
      pubDate: new Date().toUTCString(),
    };
  }
}

/**
 * Batch rewrite handler — preserves all items even if one fails.
 */
export async function rewriteRssFeedItems(feedItems = []) {
  const results = [];

  for (const item of feedItems) {
    if (!item || (!item.title && !item.summary)) continue;

    try {
      const rewritten = await rewriteArticle(item);
      results.push(rewritten);
    } catch (err) {
      error("❌ RSS item rewrite failed", {
        itemTitle: item?.title || "Untitled",
        err: err.message,
      });
      results.push({
        ...item,
        rewritten: `⚠️ Rewrite failed: ${err.message}`,
        shortGuid: `ai-news-${crypto.randomBytes(5).toString("hex")}`,
      });
    }
  }

  info("rss-feed-creator.model.batch.complete", {
    totalItems: feedItems.length,
    rewrittenItems: results.length,
  });

  return results;
}

export default { rewriteRssFeedItems };
