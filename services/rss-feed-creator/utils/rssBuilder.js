// ============================================================
// 🧠 Clean, validator-safe RSS Builder + XML Parser
// ============================================================

import { create, parse } from "xmlbuilder2";
import { putText } from "../../shared/utils/r2-client.js";
import { info, error } from "#logger.js";

function safe(v) {
  return (v ?? "").toString().trim();
}

function rfc822(date) {
  const d = new Date(date);
  return d.toUTCString();
}

/**
 * 🏗️ Build newsletter RSS 2.0 feed
 * @param {object} channel - feed metadata
 * @param {Array<object>} items - newsletter issues
 * @returns {string} XML string
 */
export function buildRssXml(channel, items = []) {
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
    doc
      .ele("atom:link", {
        href: channel.selfURL,
        rel: "self",
        type: "application/rss+xml",
      })
      .up();
  }

  // 📰 Add each newsletter issue
  for (const issue of items) {
    const item = doc.ele("item");
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

  return doc.end({ prettyPrint: true });
}

/**
 * 💾 Save newsletter RSS XML to R2
 * @param {string} xml - RSS XML content
 * @param {string} bucket - R2 bucket name
 * @param {string} key - object key
 */
export async function saveNewsletterRSS(xml, bucket, key = "feed.xml") {
  try {
    await putText(bucket, key, xml);
    info("rss.save.success", { bucket, key });
  } catch (err) {
    error("rss.save.fail", { bucket, key, err: err.message });
  }
}

/**
 * 📜 Parse existing RSS XML into item objects
 * @param {string} xml - existing RSS feed XML
 * @returns {Array<object>} parsed RSS items
 */
export function parseExistingRssXml(xml) {
  if (!xml || typeof xml !== "string") return [];

  try {
    const doc = parse(xml);
    const itemNodes = doc.findAll("item");

    const items = itemNodes.map((item) => ({
      title: item.get("title")?.text() || "",
      link: item.get("link")?.text() || "",
      description: item.get("description")?.text() || "",
      pubDate: item.get("pubDate")?.text() || "",
      guid: item.get("guid")?.text() || "",
    }));

    return items.filter((i) => i.title || i.link);
  } catch (err) {
    error("rss.parse.fail", { message: err.message });
    return [];
  }
}
