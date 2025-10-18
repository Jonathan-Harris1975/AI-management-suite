// Build and upload RSS XML to R2
import { putText } from "../../shared/utils/r2-client.js";

export async function rebuildRss(items = []) {
  const now = new Date().toISOString();
  const xmlItems = items.map((it, i) => {
    const title = escapeXml(it.title || `Item ${i+1}`);
    const link  = escapeXml(it.link || "https://example.com");
    const guid  = escapeXml(it.link ? `${it.link}#${i+1}` : `guid-${i+1}`);
    const pub   = new Date(it.pubDate || Date.now()).toISOString();
    const src   = it.source ? `<source>${escapeXml(it.source)}</source>` : "";
    return `<item><title>${title}</title><link>${link}</link><guid>${guid}</guid><pubDate>${pub}</pubDate>${src}</item>`;
  }).join("");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>AI Podcast Suite Feed</title>
    <link>${process.env.R2_PUBLIC_BASE_URL_RSS || "https://example.com"}</link>
    <description>Auto-generated feed from feeds.txt + urls.txt</description>
    <lastBuildDate>${now}</lastBuildDate>
    ${xmlItems}
  </channel>
</rss>`;

  await putText("rss.xml", xml);
}

function escapeXml(s) {
  return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
