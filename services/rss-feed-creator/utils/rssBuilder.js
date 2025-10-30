/**
 * 🧠 Build a valid RSS 2.0 feed (W3C-compliant)
 * @param {object} channel - feed metadata
 * @param {Array<object>} items - array of feed items
 * @returns {string} RSS XML
 */
export function buildRssXml(channel, items = []) {
  const doc = create({ version: "1.0", encoding: "UTF-8" })
    .ele("rss", {
      version: "2.0",
      "xmlns:atom": "http://www.w3.org/2005/Atom",
    });

  const ch = doc.ele("channel");

  ch.ele("title").txt(safe(channel.title)).up();
  ch.ele("link").txt(safe(channel.link)).up();
  ch.ele("description").dat(safe(channel.description)).up();
  ch.ele("language").txt(safe(channel.language || "en-gb")).up();
  ch.ele("lastBuildDate").txt(rfc822(new Date())).up();

  if (channel.selfURL) {
    ch.ele("atom:link", {
      href: channel.selfURL,
      rel: "self",
      type: "application/rss+xml",
    }).up();
  }

  // Add feed items
  for (const issue of items) {
    const item = ch.ele("item");
    item.ele("title").txt(safe(issue.title)).up();
    if (issue.link) item.ele("link").txt(issue.link).up();
    item
      .ele("guid", { isPermaLink: "true" })
      .txt(issue.link || issue.id || safe(issue.title))
      .up();
    item.ele("pubDate").txt(rfc822(issue.pubDate || new Date())).up();
    item.ele("description").dat(safe(issue.description)).up();
    item.up();
  }

  // ✅ Close channel and rss properly
  return doc.end({ prettyPrint: true });
      }


import { XMLParser } from "fast-xml-parser";

/**
 * Parses an existing RSS XML string into a JavaScript object.
 * Keeps attributes and nested tags for feed regeneration.
 */

    return parser.parse(xmlContent);
  } catch (err) {
    console.error("[rssBuilder] Failed to parse existing RSS XML:", err);
    return null;
  }
}

import { XMLParser } from "fast-xml-parser";

/**
 * Parses an existing RSS XML string into a JavaScript object.
 * Keeps attributes and nested tags for feed regeneration.
 */
export function parseExistingRssXml(xmlContent) {
  try {
    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: "",
      allowBooleanAttributes: true,
      preserveOrder: false
    });
    return parser.parse(xmlContent);
  } catch (err) {
    console.error("[rssBuilder] Failed to parse existing RSS XML:", err);
    return null;
  }
}

export { buildRssXml, parseExistingRssXml };
