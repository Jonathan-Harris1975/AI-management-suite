// /services/rss-feed-creator/utils/rssBuilder.js

import { XMLBuilder, XMLParser } from "fast-xml-parser";

/**
 * Builds an RSS XML string from feed items and metadata.
 * @param {Object} options
 * @param {Array} options.items - Array of feed items to include.
 * @param {Object} options.meta - Feed metadata (title, link, description, etc.)
 * @returns {string} XML feed string
 */
export function buildRssXml({ items = [], meta = {} }) {
  const builder = new XMLBuilder({
    ignoreAttributes: false,
    attributeNamePrefix: "",
    suppressBooleanAttributes: false,
    format: true,
    indentBy: "  ",
  });

  const rssObject = {
    rss: {
      version: "2.0",
      channel: {
        title: meta.title || "AI Podcast Feed",
        link: meta.link || "https://jonathan-harris.online",
        description:
          meta.description ||
          "Latest AI insights, rewritten news, and podcast updates by Jonathan Harris.",
        language: meta.language || "en-gb",
        pubDate: new Date().toUTCString(),
        lastBuildDate: new Date().toUTCString(),
        item: items.map((item) => ({
          title: item.title || "Untitled",
          link: item.link || "",
          description: item.description || "",
          pubDate: item.pubDate || new Date().toUTCString(),
          guid: item.guid || item.link || "",
        })),
      },
    },
  };

  return builder.build(rssObject);
}

/**
 * Parses an existing RSS XML string into a simplified structure
 * returning a normalized array of existing feed items.
 */
export function parseExistingRssXml(xmlContent) {
  try {
    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: "",
      allowBooleanAttributes: true,
      preserveOrder: false,
    });
    const parsed = parser.parse(xmlContent);

    // Validate typical structure: rss > channel > item
    if (parsed?.rss?.channel?.item) {
      const items = Array.isArray(parsed.rss.channel.item)
        ? parsed.rss.channel.item
        : [parsed.rss.channel.item];
      return { items, channel: parsed.rss.channel };
    }

    console.warn("[rssBuilder] Parsed existing RSS but no valid channel/item nodes found.");
    return { items: [], channel: null };
  } catch (err) {
    console.error("[rssBuilder] Failed to parse existing RSS XML:", err);
    return { items: [], channel: null };
  }
}

export { buildRssXml, parseExistingRssXml };
