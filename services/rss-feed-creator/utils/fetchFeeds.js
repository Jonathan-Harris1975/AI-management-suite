/**
 * fetchFeeds.js
 * -----------------
 * Loads RSS feed URLs from the data/ directory or R2 and fetches them.
 * Returns a combined list of feed items for rewriting.
 */

import fs from "fs";
import path from "path";
import Parser from "rss-parser";
import { info, error } from "#logger.js";

const parser = new Parser();

/**
 * Read a local text file safely, returning an array of non-empty lines.
 */
function readLocalList(filename) {
  try {
    const filePath = path.resolve(
      "services/rss-feed-creator/data",
      filename
    );
    if (!fs.existsSync(filePath)) return [];
    const data = fs.readFileSync(filePath, "utf-8");
    return data
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 0 && !l.startsWith("#"));
  } catch (err) {
    error("rss.fetchFeeds.readLocalList.fail", { filename, err: err.message });
    return [];
  }
}

/**
 * Fetch and parse all feeds listed in data/url-feeds.txt and data/rss-feeds.txt.
 */
export async function fetchFeeds() {
  const urlFeeds = readLocalList("url-feeds.txt");
  const rssFeeds = readLocalList("rss-feeds.txt");
  const allFeeds = [...new Set([...urlFeeds, ...rssFeeds])];

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
