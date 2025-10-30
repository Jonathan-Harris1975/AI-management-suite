// /services/rss-feed-creator/utils/rssBuilder.js

import { XMLBuilder, XMLParser } from "fast-xml-parser";

/**
 * Builds an RSS XML string from feed items and metadata.
 * This is used when saving or regenerating the R2 feed.xml file.
 */
function buildRssXml({ items = [], meta = {} }) {
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
 * Parses an existing RSS XML string into a safe normalized structure.
 * This version is fault-tolerant and recognizes multiple RSS formats.
 */
function parseExistingRssXml(xmlContent) {
  try {
    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: "",
      allowBooleanAttributes: true,
      preserveOrder: false,
    });

    const parsed = parser.parse(xmlContent);

    // Support multiple possible RSS root structures
    const channel =
      parsed?.rss?.channel ||
      parsed?.rssFeed?.channel ||
      parsed?.feed?.channel ||
      null;

    if (channel?.item) {
      const items = Array.isArray(channel.item)
        ? channel.item
        : [channel.item];
      return { items, channel };
    }

    // Log structure if unexpected
    console.warn(
      "[rssBuilder] Parsed existing RSS but no valid channel/item nodes found.",
      Object.keys(parsed)
    );
    return { items: [], channel: null };
  } catch (err) {
    console.error("[rssBuilder] Failed to parse existing RSS XML:", err);
    return { items: [], channel: null };
  }
}

/**
 * Exports
 * Both functions are declared normally and exported once at the end to prevent duplicate exports.
 */
export { buildRssXml, parseExistingRssXml };
