// ============================================================
// 🧠 RSS Feed Creator — Rewrite Pipeline (Final Production Build)
// ------------------------------------------------------------
// - Pulls the next feed via ensureR2Sources()
// - Downloads, parses, and rewrites each article
// - Uses rss-prompts.js and shared URL shortener
// - Uploads rewritten RSS XML to R2
// ============================================================

import Parser from "rss-parser";
import { info, error } from "#logger.js";
import { uploadBuffer } from "#shared/r2-client.js";
import { shortUrl } from "#shared/utils/urlShorten.js";
import { RSS_SYSTEM_PROMPT, buildRSSUserPrompt, normalizeRewrittenItem } from "./utils/rss-prompts.js";
import { ensureR2Sources, saveRotation } from "./utils/rss-bootstrap.js";
import { callModel } from "../shared/utils/llmClient.js"; // your existing model wrapper
import { buildXMLFeed } from "./utils/rss-utils.js"; // converts back to valid RSS XML

const parser = new Parser();

// Main rewrite pipeline
export default async function runRewritePipeline(feedXml, options = {}) {
  try {
    const { feeds, rotation } = await ensureR2Sources();
    const index = rotation?.lastIndex || 0;
    const feedUrl = feeds[index];
    const nextIndex = (index + 1) % feeds.length;
    await saveRotation(nextIndex);

    info(`🌐 Downloading RSS feed: ${feedUrl}`);
    const feed = await parser.parseURL(feedUrl);
    if (!feed?.items?.length) throw new Error("No items found in feed.");

    const maxItems = Number(process.env.RSS_MAX_ITEMS || 3);
    const items = feed.items.slice(0, maxItems);

    info(`🧩 Rewriting ${items.length} recent feed items via AI model...`);

    const rewrittenItems = [];
    for (const item of items) {
      try {
        const system = RSS_SYSTEM_PROMPT;
        const user = buildRSSUserPrompt(item);
        const raw = await callModel({ system, user }); // <- uses your GPT model internally

        const { title, summary } = normalizeRewrittenItem(raw);
        const shortLink = await shortUrl(item.link);

        rewrittenItems.push({
          title,
          link: shortLink || item.link,
          content: summary,
          pubDate: item.pubDate || item.isoDate || new Date().toUTCString(),
          author: item.creator || item.author || "Unknown",
        });
      } catch (err) {
        error(`❌ Rewrite failed for one item: ${err.message}`);
      }
    }

    // Build the new RSS XML
    const rewrittenFeedXml = buildXMLFeed({
      title: feed.title || "AI News Digest",
      description: "Rewritten AI industry news summaries.",
      link: feed.link || feedUrl,
      items: rewrittenItems,
    });

    // Upload to R2
    const bucket = process.env.R2_BUCKET_RSS_FEEDS || "rss-feeds";
    const timestamp = Date.now();
    const safeName = feedUrl.replace(/https?:\/\//, "").replace(/[^a-zA-Z0-9]/g, "_");
    const key = `rewritten-${safeName}-${timestamp}.xml`;

    info("☁️ Uploading rewritten feed to R2...");
    await uploadBuffer(bucket, key, Buffer.from(rewrittenFeedXml, "utf8"));
    info(`📤 Uploaded rewritten feed: ${key}`);

    const publicUrl = `${process.env.R2_PUBLIC_BASE_URL_RSS || process.env.R2_PUBLIC_BASE_URL_PODCAST}/${key}`;
    info(`🌍 Public feed available at: ${publicUrl}`);

    return { success: true, key, publicUrl, itemCount: rewrittenItems.length };
  } catch (err) {
    error("💥 Rewrite pipeline failed", { message: err.message, stack: err.stack });
    return { success: false, error: err.message };
  }
}
