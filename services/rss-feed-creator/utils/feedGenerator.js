/**
 * fetchFeeds.js
 * -----------------
 * Loads RSS feed URLs from either local data/ folder or from R2.
 * Returns a combined list of feed items ready for rewriting.
 */

import fs from "fs";
import path from "path";
import Parser from "rss-parser";
import { info, error } from "#logger.js";
import { getObjectAsText } from "../../shared/utils/r2-client.js";

const parser = new Parser();

// Helper: read a local file if available
async function readLocalOrR2File(filename, bucket = "rss-feeds") {
  const localPath = path.resolve("services/rss-feed-creator/data", filename);

  // Try local file first
  if (fs.existsSync(localPath)) {
    const data = fs.readFileSync(localPath, "utf-8");
    return data;
  }

  // Fall back to Cloudflare R2
  try {
    const r2Path = `data/${filename}`;
    const text = await getObjectAsText(bucket, r2Path);
    if (text && text.length > 0) {
      info("rss.fetchFeeds.fromR2.success", { filename, bucket });
      return text;
    }
  } catch (err) {
    error("rss.fetchFeeds.fromR2.fail", { filename, bucket, error: err.message });
  }

  return "";
}

// Parse list of URLs from a text block
function parseUrlList(text) {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"));
}

// Main function
export async function fetchFeeds() {
  const rssFeedsText = await readLocalOrR2File("rss-feeds.txt");
  const urlFeedsText = await readLocalOrR2File("url-feeds.txt");

  const rssFeeds = parseUrlList(rssFeedsText);
  const urlFeeds = parseUrlList(urlFeedsText);
  const allFeeds = [...new Set([...rssFeeds, ...urlFeeds])];

  if (allFeeds.length === 0) {
    throw new Error("No feeds available");
  }

  info("rss.fetchFeeds.start", { totalFeeds: allFeeds.length });

  const articles = [];

  for (const feedUrl of allFeeds) {
    try {
      const parsed = await parser.parseURL(feedUrl);
      for (const item of parsed.items) {
        articles.push({
          title: item.title,
          summary: item.contentSnippet || item.content || "",
          link: item.link,
          pubDate: item.pubDate,
          source: feedUrl,
        });
      }
      info("rss.fetchFeeds.success", { feedUrl, items: parsed.items.length });
    } catch (err) {
      error("rss.fetchFeeds.fail", { feedUrl, err: err.message });
    }
  }

  info("📥 Fetch complete", { total: articles.length });
  return articles;
}
