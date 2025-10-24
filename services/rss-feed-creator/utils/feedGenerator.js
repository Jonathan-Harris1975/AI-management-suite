// Builds RSS XML and JSON metadata from the processed items list.
import { putText, getPublicBase, getBucketName } from "#shared/r2-client.js"; // Adjusted path to shared R2 client
import { log } from "#logger.js"; // Adjusted path for logger

// R2 object keys (match repo layout in production)
const ITEMS_KEY = "items.json";
const RSS_XML_KEY = "feed.xml";
const RSS_JSON_KEY = "feed.json";
const RSS_TITLE = "AI News - AI Condensed";
const RSS_DESCRIPTION = "Daily summarized headlines from various sources: titles <= 12 words; summaries 200-400 chars.";

function esc(s) {
  return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}

export async function rebuildRss(items) {
  if (!Array.isArray(items) || items.length === 0) {
    log.warn("⚠️ rebuildRss called with no items. Skipping XML generation.");
    return { items: 0, wrote: [] };
  }
  
  const bucket = getBucketName();
  const publicBase = getPublicBase();

  const now = new Date().toUTCString();
  
  // Sort items by timestamp descending (most recent first)
  const sortedItems = items.sort((a, b) => b.ts - a.ts);

  const xmlItems = sortedItems.map(it => {
    // Convert timestamp to RFC 2822 date format
    const pubDate = new Date(it.ts).toUTCString();
    
    // Use the rewritten content as the description
    // The description content should be wrapped in CDATA for safety, but since we are escaping, we can skip CDATA for simplicity if the content is clean.
    // Given the original rewrite-pipeline used CDATA, we will use it here for the description.
    // However, the original `feedGenerator.js` did not use CDATA, and the `index.js` uses `rebuildRss` which is a placeholder.
    // Let's use a simple escaped description for now, as the `index.js` logic is independent of the old `rewrite-pipeline.js` logic.
    // We will use a simple HTML description for better formatting in some readers.
    const description = `<p>${esc(it.rewrite)}</p><p>Original article: <a href="${esc(it.url)}">${esc(it.url)}</a></p>`;

    return [
      "<item>",
      `<title>${esc(it.title)}</title>`,
      `<link>${esc(it.shortUrl || it.url)}</link>`,
      `<guid>${esc(it.guid)}</guid>`,
      `<pubDate>${pubDate}</pubDate>`,
      `<description><![CDATA[${description}]]></description>`,
      "</item>"
    ].join("");
  }).join("");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>${esc(RSS_TITLE)}</title>
    <link>${esc(publicBase)}/${RSS_XML_KEY}</link>
    <description>${esc(RSS_DESCRIPTION)}</description>
    <lastBuildDate>${esc(now)}</lastBuildDate>
    ${xmlItems}
  </channel>
</rss>`;

  const meta = {
    generatedAt: now,
    publicBase: publicBase,
    items: sortedItems.length
  };

  // Upload XML feed
  await putText(bucket, RSS_XML_KEY, xml, "application/rss+xml; charset=utf-8");
  log.info({ key: RSS_XML_KEY, count: sortedItems.length }, "💾 RSS XML feed saved");

  // Upload JSON metadata (optional but good practice)
  await putText(bucket, RSS_JSON_KEY, JSON.stringify(meta, null, 2), "application/json; charset=utf-8");
  log.info({ key: RSS_JSON_KEY }, "💾 RSS JSON metadata saved");

  return { items: sortedItems.length, wrote: [RSS_XML_KEY, RSS_JSON_KEY] };
}

