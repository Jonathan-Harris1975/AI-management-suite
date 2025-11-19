// ============================================================
// 🧠 RSS Feed Creator — AI Rewrite & Short Title Models
// ============================================================
//
// - Rewrites RSS items via resilientRequest()
// - Generates concise branded titles
// - Uses Short.io for link shortening
// - Adds ai-news prefixed GUIDs
// - Exposes both rssRewrite and rssShortTitle model routes
// ============================================================

import crypto from "crypto";
import { info, error,debug } from "#logger.js";
import { resilientRequest } from "../../shared/utils/ai-service.js";
import { RSS_PROMPTS } from "./rss-prompts.js";
import { shortenUrl } from "./shortio.js";

// ============================================================
// 🔹 Generate short title (rssShortTitle route)
// ============================================================

export async function generateShortTitle(item = {}) {
  try {
    const title = item?.title?.trim() || "";
    const summary = item?.summary?.trim() || "";
    const rewritten = item?.rewritten?.trim() || "";

    if (!title && !summary && !rewritten) {
      throw new Error("No input content for rssShortTitle");
    }

    const systemPrompt =
      "You are an editorial assistant that creates short, catchy RSS titles for AI news items. Keep it under 10 words, no punctuation at the end, no emojis, no quotes, and output plain text only.";

    const userPrompt = [
      "Original title:",
      title,
      "",
      "Summary:",
      summary,
      "",
      "Rewritten text:",
      rewritten,
      "",
      "→ Output only the concise RSS title text."
    ].join("\n");

    const messages = [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ];

    const result = await resilientRequest("rssShortTitle", { messages });

    const shortTitle = (result?.trim?.() || title || "Untitled Article")
      .replace(/[\r\n]+/g, " ")
      .replace(/^["']|["']$/g, "")
      .trim();

    debug("rss-feed-creator.shortTitle.success", {
      route: "rssShortTitle",
      shortTitle,
    });

    return shortTitle.length > 80 ? shortTitle.slice(0, 77) + "..." : shortTitle;
  } catch (err) {
    error("rss-feed-creator.shortTitle.fail", {
      route: "rssShortTitle",
      err: err.message,
    });
    return item?.title?.slice(0, 60) || "Untitled Article";
  }
}

// ============================================================
// 🔹 Rewrite article (rssRewrite route)
// ============================================================

export async function rewriteArticle(item = {}) {
  try {
    const title = item?.title?.trim() || "Untitled article";
    const summary = item?.summary?.trim() || "No summary provided.";
    const link = item?.link?.trim() || "";

    if (!title && !summary) {
      throw new Error("Invalid feed item — missing title and summary");
    }

    // --- 1️⃣ Rewrite the article content ---
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

    // --- 2️⃣ Generate short title via rssShortTitle route ---
    const shortTitle = await generateShortTitle({ title, summary, rewritten });

    // --- 3️⃣ Shorten URL using Short.io ---
    const shortUrl = await shortenUrl(link);

    // --- 4️⃣ Generate ai-news GUID ---
    const shortGuid = `ai-news-${crypto.randomBytes(5).toString("hex")}`;

    debug("rss-feed-creator.model.success", {
      route: "rssRewrite",
      title: shortTitle,
      shortUrl,
      guid: shortGuid,
    });

    // --- 5️⃣ Return enriched item ---
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

// ============================================================
// 🔹 Batch rewrite handler — preserves all items
// ============================================================

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

  debug("rss-feed-creator.model.batch.complete", {
    totalItems: feedItems.length,
    rewrittenItems: results.length,
  });

  return results;
}

// ============================================================
// 🔹 Export model route map
// ============================================================

export default {
  rssRewrite: rewriteArticle,
  rssShortTitle: generateShortTitle,
  rewriteRssFeedItems,
};
