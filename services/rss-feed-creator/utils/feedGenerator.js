/**
 * feedGenerator.js
 * -----------------
 * Builds an RSS XML feed from fetched or rewritten articles and saves it to R2.
 * This module is fully independent from the Podcast Suite.
 */

import { uploadToR2 } from "../../shared/utils/r2-client.js";
import { loadFeedRotation } from "./feedRotationManager.js";
import { FeedItem } from "./models.js";

/**
 * Generate and upload an RSS feed to the R2 bucket.
 * @param {Array<Object>} items - Array of feed items with title/link/etc.
 * @param {string} publicBase - Public base URL for feed links.
 */
export async function generateFeed(items = [], publicBase = "https://jonathan-harris.online") {
  const now = new Date().toUTCString();

  const { feedIndex } = await loadFeedRotation();
  const f = feedIndex || "feed";
  const u = publicBase;

  // 🧩 Define a neutral default description
  const defaultDesc = "Auto-generated summary from curated AI news sources.";

  const esc = (txt = "") =>
    txt.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  // Normalize all items into FeedItem objects
  const normalized = items.map((it, i) =>
    new FeedItem({
      title: it.title || `Untitled #${i + 1}`,
      link: it.link || u,
      guid: `${u || f}#${i + 1}`,
      pubDate: it.pubDate || new Date().toUTCString(),
      source: it.source || null,
    })
  );

  const channelTitle = process.env.RSS_FEED_TITLE || "AI Feed Generator";
  const channelLink = publicBase;
  const channelDesc =
    process.env.RSS_FEED_DESCRIPTION ||
    "Automatically generated AI news feed from curated RSS sources.";

  const xmlItems = normalized
    .map(
      (it) =>
        [
          "<item>",
          `<title>${esc(it.title)}</title>`,
          `<link>${esc(it.link)}</link>`,
          `<guid>${esc(it.guid)}</guid>`,
          `<description>${esc(defaultDesc)}</description>`,
          `<pubDate>${esc(it.pubDate)}</pubDate>`,
          it.source ? `<source>${esc(it.source)}</source>` : "",
          "</item>",
        ].join("")
    )
    .join("");

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

  // ✅ Upload feed XML to the R2 bucket
  const key = `feeds/feed-${Date.now()}.xml`;
  await uploadToR2("rss-feeds", key, xml);

  return {
    ok: true,
    savedTo: key,
    items: normalized.length,
  };
}
