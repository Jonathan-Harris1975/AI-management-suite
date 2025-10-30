import { create } from 'xmlbuilder2';
import { XMLParser } from "fast-xml-parser";

/**
 * Safely escape text content for XML
 */
function safe(text) {
  if (!text) return '';
  return String(text);
}

/**
 * Format date to RFC 822 (RSS 2.0 standard)
 */
function rfc822(date) {
  return new Date(date).toUTCString();
}

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

  // Required channel elements
  ch.ele("title").txt(safe(channel.title)).up();
  ch.ele("link").txt(safe(channel.link)).up();
  ch.ele("description").txt(safe(channel.description)).up();

  // Optional but recommended channel elements
  if (channel.language) {
    ch.ele("language").txt(safe(channel.language)).up();
  }
  ch.ele("lastBuildDate").txt(rfc822(new Date())).up();

  // Atom self-reference link
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
    
    // Title is required for item
    item.ele("title").txt(safe(issue.title)).up();
    
    // Link (recommended)
    if (issue.link) {
      item.ele("link").txt(safe(issue.link)).up();
    }
    
    // GUID - should have isPermaLink only if it's actually a URL
    const guidValue = issue.guid || issue.link || issue.id || safe(issue.title);
    const isPermaLink = issue.link && (issue.guid === issue.link || !issue.guid);
    item.ele("guid", { isPermaLink: isPermaLink ? "true" : "false" })
      .txt(safe(guidValue))
      .up();
    
    // PubDate (recommended)
    if (issue.pubDate) {
      item.ele("pubDate").txt(rfc822(issue.pubDate)).up();
    }
    
    // Description - use txt() instead of dat() for proper escaping
    if (issue.description) {
      item.ele("description").txt(safe(issue.description)).up();
    }
    
    item.up();
  }

  return doc.end({ prettyPrint: true });
}

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
