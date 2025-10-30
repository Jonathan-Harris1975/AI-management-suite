// /services/rss-feed-creator/utils/rssBuilder.js
// ✅ Final version - robust, ESM-safe

import { XMLBuilder, XMLParser } from "fast-xml-parser";

/**
 * Builds a valid RSS XML string from feed items and metadata.
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
          "AI Podcast Suite — rewritten AI news and insights by Jonathan Harris.",
        language: meta.language || "en-gb",
        pubDate: new Date().toUTCString(),
        lastBuildDate: new Date().toUTCString(),
        item: (items || []).map((item) => ({
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
 * Parses an existing RSS XML string into a normalized format.
 * Always returns { items, channel } — never undefined.
 */
function parseExistingRssXml(xmlContent) {
  try {
    if (!xmlContent || typeof xmlContent !== "string" || xmlContent.trim().length < 50) {
      console.warn("[rssBuilder] Skipping parse — empty or placeholder feed.");
      return { items: [], channel: null };
    }

    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: "",
      allowBooleanAttributes: true,
      preserveOrder: false,
      trimValues: true,
    });

    const parsed = parser.parse(xmlContent);

    // Support multiple possible RSS root structures
    const channel =
      parsed?.rss?.channel ||
      parsed?.rssFeed?.channel ||
      parsed?.feed?.channel ||
      null;

    // Fallback for malformed feeds (e.g., <rss><item>...</item></rss>)
    const itemsDirect = parsed?.rss?.item || parsed?.item || null;

    if (channel?.item) {
      const items = Array.isArray(channel.item) ? channel.item : [channel.item];
      return { items, channel };
    }

    if (itemsDirect) {
      const items = Array.isArray(itemsDirect) ? itemsDirect : [itemsDirect];
      return {
        items,
        channel: {
          title: "Recovered AI Podcast Feed",
          link: "https://jonathan-harris.online",
          description: "Recovered feed data from malformed RSS XML",
        },
      };
    }

    console.warn("[rssBuilder] Parsed RSS but found no valid items.", Object.keys(parsed || {}));
    return { items: [], channel: null };
  } catch (err) {
    console.error("[rssBuilder] Failed to parse existing RSS XML:", err);
    return { items: [], channel: null };
  }
}

export { buildRssXml, parseExistingRssXml };
