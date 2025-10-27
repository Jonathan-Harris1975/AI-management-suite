// services/script/utils/rssFetcher.js

import Parser from "rss-parser";
import { info, error } from "#logger.js";

const parser = new Parser();

/**
 * Fetches RSS feed articles and filters those newer than 24h.
 */
export async function getFeedArticles(feedUrl) {
  try {
    info("rssFetcher.start", { feedUrl });
    const feed = await parser.parseURL(feedUrl);
    const now = Date.now();
    const dayAgo = now - 24 * 60 * 60 * 1000;

    const freshItems = feed.items.filter(item => {
      const pubDate = new Date(item.pubDate || item.isoDate || 0).getTime();
      return pubDate > dayAgo;
    });

    const articles = freshItems.map(i => i.title + " — " + i.contentSnippet);
    info("rssFetcher.success", { count: articles.length });

    return articles.slice(0, 5); // limit to 5 to keep the LLM focused
  } catch (err) {
    error("rssFetcher.fail", { err: err.message });
    return [];
  }
}
