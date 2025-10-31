// Builds RSS XML + JSON metadata from feeds.txt + urls.txt in R2
import { r2GetText, r2Put, r2GetPublicBase, getBucketName } from "../../shared/utils/r2-client.js";

function jlog(message, meta = undefined) {
  const line = { time: new Date().toISOString(), message };
  if (meta && typeof meta === "object") line.meta = meta;
  process.stdout.write(JSON.stringify(line) + "\n");
}


const FILE_FEEDS = "feeds.txt";
const FILE_URLS = "urls.txt";
const FILE_XML = "feed.xml";
const FILE_JSON = "feed.json";
const FILE_CURSOR = "cursor.json";

function esc(s) {
  return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}

export async function generateFeed() {
  const bucket = getBucketName();
  const publicBase = r2GetPublicBase();

  const feedsTxt = await r2GetText(bucket, FILE_FEEDS);
  const urlsTxt  = await r2GetText(bucket, FILE_URLS);
  const feeds = (feedsTxt || "").split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  const urls  = (urlsTxt  || "").split(/\r?\n/).map(s => s.trim()).filter(Boolean);

  jlog("🟡 rss:process", { feeds: feeds.length, urls: urls.length });

  const now = new Date().toISOString();
  const items = [];
  const maxFeeds = 5; // Use exactly 5 RSS feeds
  const maxUrls = 1;  // Use exactly 1 URL item
  const max = Math.max(maxFeeds, maxUrls);
  for (let i = 0; i < max; i++) {
        const f = (i < maxFeeds && feeds[i]) ? feeds[i] : "";
        const u = (i < maxUrls && urls[i]) ? urls[i] : "";
    if (!f && !u) continue;
    items.push({
      title: `Item ${i+1}`,
      link: u || f,
      guid: `${u || f}#${i+1}`,
      pubDate: now,
      source: f || null
    });
  }

  const channelTitle = "AI Podcast Suite Feed";
  const channelLink  = publicBase;
  const channelDesc  = "Auto-generated feed from feeds.txt + urls.txt";

  const xmlItems = items.map(it => [
    "<item>",
    `<title>${esc(it.title)}</title>`,
    `<link>${esc(it.link)}</link>`,
    `<guid>${esc(it.guid)}</guid>`,
    `<pubDate>${esc(it.pubDate)}</pubDate>`,
    it.source ? `<source>${esc(it.source)}</source>` : "",
    "</item>"
  ].join("")).join("");

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

  const meta = {
    generatedAt: now,
    publicBase: publicBase,
    items: items.length
  };

  await r2Put(bucket, FILE_XML, Buffer.from(xml, "utf-8"), "application/rss+xml; charset=utf-8");
  await r2Put(bucket, FILE_JSON, Buffer.from(JSON.stringify(meta, null, 2), "utf-8"), "application/json; charset=utf-8");

  const cursor = { lastRun: now, items: items.length };
  await r2Put(bucket, FILE_CURSOR, Buffer.from(JSON.stringify(cursor, null, 2), "utf-8"), "application/json; charset=utf-8");

  return { items: items.length, wrote: [FILE_XML, FILE_JSON, FILE_CURSOR] };
}

