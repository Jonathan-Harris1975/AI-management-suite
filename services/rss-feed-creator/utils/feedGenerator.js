/**
 * feedGenerator.js
 * -----------------
 * Builds an RSS XML feed from rewritten articles and saves it to R2.
 * This module is independent of the podcast pipeline.
 */

import { uploadFileToR2 } from "../../shared/utils/r2-client.js";
import { loadFeedRotation } from "./feedRotationManager.js";

function esc(txt = "") {
  return String(txt)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Generate and upload an RSS feed to the R2 bucket.
 */
export async function generateFeed(
  items = [],
  publicBase = "https://jonathan-harris.online"
) {
  const now = new Date().toUTCString();
  const { feedIndex } = await loadFeedRotation();
  const rotationId = feedIndex || "feed";

  const xmlItems = items
    .map((it, i) => {
      const title = it.title || `Untitled #${i + 1}`;
      const link = it.shortLink || it.link || publicBase;
      const guid = `${link || rotationId}#${i + 1}`;
      const pubDate = it.pubDate || new Date().toUTCString();
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

  // ✅ Correct R2 save call
  const key = `feeds/feed-${Date.now()}.xml`;
  await uploadFileToR2(process.env.R2_BUCKET_RSS_FEEDS, key, xml, "application/rss+xml");

  return {
    ok: true,
    savedTo: key,
    items: items.length,
  };
}
