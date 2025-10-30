// Clean, validator-safe RSS builder for Jonathan Harris Newsletter
import { create } from "xmlbuilder2";
import { putText } from "../../shared/utils/r2-client.js";
import { info } from "#logger.js";

function safe(v) {
  return (v ?? "").toString().trim();
}

function rfc822(date) {
  const d = new Date(date);
  return d.toUTCString();
}

/**
 * Build newsletter RSS 2.0 feed
 * @param {object} channel - feed metadata
 * @param {Array<object>} items - newsletter issues
 * @returns {string} XML string
 */
export function buildNewsletterRSS(channel, items = []) {
  const doc = create({ version: "1.0", encoding: "UTF-8" })
    .ele("rss", {
      version: "2.0",
      "xmlns:atom": "http://www.w3.org/2005/Atom",
    })
    .ele("channel");

  doc.ele("title").txt(safe(channel.title)).up();
  doc.ele("link").txt(safe(channel.link)).up();
  doc.ele("description").dat(safe(channel.description)).up();
  doc.ele("language").txt(safe(channel.language || "en-gb")).up();
  doc.ele("lastBuildDate").txt(rfc822(new Date())).up();

  if (channel.selfURL) {
    doc.ele("atom:link", {
      href: channel.selfURL,
      rel: "self",
      type: "application/rss+xml",
    }).up();
  }

  // Add each newsletter issue
  for (const issue of items) {
    const item = doc.ele("item");
    item.ele("title").txt(safe(issue.title)).up();
    if (issue.link) item.ele("link").txt(issue.link).up();
    item.ele("guid", { isPermaLink: "true" }).txt(issue.link || issue.id || safe(issue.title)).up();
    item.ele("pubDate").txt(rfc822(issue.pubDate || new Date())).up();
    item.ele("description").dat(safe(issue.description)).up();
    item.up();
  }

  return doc.end({ prettyPrint: true });
}

/**
 * Save newsletter RSS to R2
 */
export async function saveNewsletterRSS(xml) {
  await putText(process.env.R2_BUCKET_RSS_FEEDS, "newsletter.xml", xml, "application/rss+xml");
  info("rss.newsletter.saved", { bytes: xml.length });
  return { key: "newsletter.xml", bytes: xml.length };
}
