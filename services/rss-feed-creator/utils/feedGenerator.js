/**
 * feedGenerator.js
 * -----------------
 * Builds an RSS XML feed from fetched or rewritten articles and saves it to R2.
 * This module is independent from the podcast pipeline.
 */

import { uploadToR2 } from "../../shared/utils/r2-client.js";
import { loadFeedRotation } from "./feedRotationManager.js";

/**
 * Escape text so it's valid inside XML.
 */
function esc(txt = "") {
  return String(txt)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Generate and upload an RSS feed to the R2 bucket.
 *
 * @param {Array<Object>} items - Array of feed items in the shape coming out of rewriteRssFeedItems():
 *   {
 *     title: string
 *     summary?: string
 *     link: string
 *     rewritten: string   // AI rewritten content
 *     shortLink?: string  // optional from Short.io
 *     pubDate?: string
 *     source?: string
 *   }
 *
 * @param {string} publicBase - Base URL to fall back on if a link is missing.
 */
export async function generateFeed(
  items = [],
  publicBase = "https://jonathan-harris.online"
) {
  const now = new Date().toUTCString();

  // feedRotation can be used to version feeds or rotate filenames
  const { feedIndex } = await loadFeedRotation();
  const rotationId = feedIndex || "feed";

  // Build <item> blocks for RSS
  const xmlItems = items
    .map((it, i) => {
      const title = it.title || `Untitled #${i + 1}`;
      const link = it.shortLink || it.link || publicBase;
      const guid = `${link || rotationId}#${i + 1}`;
      const pubDate = it.pubDate || new Date().toUTCString();

      // Prefer the AI rewritten summary. Fall back to provided summary.
      const description =
        it.rewritten ||
        it.summary ||
        "Auto-generated summary from curated AI news sources.";

      return [
        "<item>",
        `<title>${esc(title)}</title>`,
        `<link>${esc(link)}</link>`,
        `<guid>${esc(guid)}</guid>`,
        `<description>${esc(description)}</description>`,
        `<pubDate>${esc(pubDate)}</pubDate>`,
        it.source ? `<source>${esc(it.source)}</source>` : "",
        "</item>",
      ].join("");
    })
    .join("");

  const channelTitle =
    process.env.RSS_FEED_TITLE || "AI Curated News Feed";
  const channelLink = publicBase;
  const channelDesc =
    process.env.RSS_FEED_DESCRIPTION ||
    "Automatically generated AI news feed from curated RSS sources.";

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>${esc(channelTitle)}</title>
    <link>${esc(channelLink)}</link>
    <description>${esc(channelDesc)}</description>
    <lastBuildDate>${esc(now)}</lastBuildDate>
    ${xmlItems}
  </channel>
</rss>`;

  // Persist final feed XML into R2
  const key = `feeds/feed-${Date.now()}.xml`;
  await uploadToR2("rss-feeds", key, xml);

  return {
    ok: true,
    savedTo: key,
    items: items.length,
  };
}
