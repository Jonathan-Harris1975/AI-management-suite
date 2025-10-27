import {s3, R2_BUCKETS, uploadBuffer, listKeys, getObjectAsText} from "../../shared/utils/r2-client.js";
import Parser from "rss-parser";
const parser = new Parser();

export async function fetchRssItems(url, maxItems = 3) {
  const feed = await parser.parseURL(url);
  const items = (feed.items || []).slice(0, maxItems).map((it) => ({
    title: it.title || "",
    link: it.link || "",
    isoDate: it.isoDate || it.pubDate || null,
    contentSnippet: it.contentSnippet || "",
    content: it.content || ""
  }));
  return { title: feed.title || "", items };
}
