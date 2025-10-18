// ============================================================
// 🧠 RSS Feed Creator — Build RSS Feed
// ============================================================
//
// Reads `utils/active-feeds.json` (feeds + target URL)
// Fetches each feed, merges items, and writes final RSS XML
// to R2 (in RSS_FEEDS or META bucket).
// ============================================================

import fs from "fs";
import path from "path";
import Parser from "rss-parser";
import { log } from "#shared/logger.js";
import {
  R2_BUCKETS,
  putText,
} from "#shared/r2-client.js";

const parser = new Parser();

const projectRoot = "/app";
const utilsDir = path.join(projectRoot, "services/rss-feed-creator/utils");
const activeFile = path.join(utilsDir, "active-feeds.json");

function resolveBucket() {
  return R2_BUCKETS.RSS_FEEDS || R2_BUCKETS.META;
}

// ------------------------------------------------------------
// 🧩 Build RSS Feed
// ------------------------------------------------------------
export async function buildRssFeed() {
  try {
    // Ensure active-feeds.json exists
    if (!fs.existsSync(activeFile)) {
      throw new Error("active-feeds.json missing — run apply-r2-text-safety.js first");
    }

    const { feeds, url } = JSON.parse(fs.readFileSync(activeFile, "utf-8"));
    if (!feeds?.length || !url) {
      throw new Error("Invalid active-feeds.json — missing feeds or url");
    }

    log.info("rss.build.start", { feedsCount: feeds.length, targetUrl: url });

    const allItems = [];

    for (const feedUrl of feeds) {
      try {
        const parsed = await parser.parseURL(feedUrl);
        const items = parsed.items?.slice(0, 10) || [];
        allItems.push(...items);
      } catch (err) {
        log.warn("rss.build.feed.fail", { feedUrl, error: err.message });
      }
    }

    // Sort items by publication date
    const sortedItems = allItems.sort((a, b) => {
      const d1 = new Date(a.isoDate || a.pubDate || 0).getTime();
      const d2 = new Date(b.isoDate || b.pubDate || 0).getTime();
      return d2 - d1;
    });

    const rssXml = generateRssXml(sortedItems, url);
    const bucket = resolveBucket();
    const key = `feeds/rss-${Date.now()}.xml`;

    await putText(bucket, key, rssXml, "application/rss+xml; charset=utf-8");

    log.info("rss.build.complete", {
      items: sortedItems.length,
      bucket,
      key,
    });

    return { xml: rssXml, key };
  } catch (err) {
    log.error("rss.build.fail", { error: err.message });
    throw err;
  }
}

// ------------------------------------------------------------
// 🧠 RSS XML Generator
// ------------------------------------------------------------
function generateRssXml(items, siteUrl) {
  const header = `<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0">\n<channel>\n<title>AI Podcast Suite Aggregator</title>\n<link>${siteUrl}</link>\n<description>Latest AI feeds merged by AI Podcast Suite</description>\n<language>en</language>\n<lastBuildDate>${new Date().toUTCString()}</lastBuildDate>\n`;

  const entries = items
    .map((item) => {
      const title = escapeXml(item.title || "Untitled");
      const link = escapeXml(item.link || siteUrl);
      const description = escapeXml(item.contentSnippet || item.content || "");
      const pubDate = new Date(item.isoDate || item.pubDate || Date.now()).toUTCString();

      return `<item>\n<title>${title}</title>\n<link>${link}</link>\n<description>${description}</description>\n<pubDate>${pubDate}</pubDate>\n</item>`;
    })
    .join("\n");

  const footer = "\n</channel>\n</rss>\n";
  return header + entries + footer;
}

// ------------------------------------------------------------
// 🧹 Utility — Safe XML escaping
// ------------------------------------------------------------
function escapeXml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
