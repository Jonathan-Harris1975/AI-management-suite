import { info, error } from "#logger.js";
import { resolveModelRewriter } from "./utils/models.js";
import { shortenUrl } from "./utils/shortio.js";
import {
  SYSTEM,
  USER_ITEM,
  normalizeModelText,
  clampTitleTo12Words,
  clampSummaryToWindow,
} from "./utils/rss-prompts.js";

const RSS_FEED_BUCKET = process.env.R2_BUCKET_RSS_FEEDS || "";
const R2_PUBLIC_BASE_URL = (process.env.R2_PUBLIC_BASE_URL_RSS || "").replace(/\/+$/, "");
export const SOURCE_FEED_CUTOFF_HOURS = Number(process.env.FEED_CUTOFF_HOURS || 24); // Default to 24 hours for source article age check
const MAX_ITEMS_PER_FEED = Number(process.env.MAX_ITEMS_PER_FEED || 6);
const MIN_SUMMARY_CHARS = Number(process.env.MIN_SUMMARY_CHARS || 300);
const MAX_SUMMARY_CHARS = Number(process.env.MAX_SUMMARY_CHARS || 1100);

function stripHtml(s = "") {
  return String(s)
    .replace(/<[^>]*>/g, " ")
    .replace(/&[a-z#0-9]+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function isRecent(pubDate, cutoffHours = SOURCE_FEED_CUTOFF_HOURS) {
  const d = new Date(pubDate || Date.now());
  return !Number.isNaN(d.getTime()) && Date.now() - d.getTime() <= cutoffHours * 60 * 60 * 1000;
}

function messagesForItem(siteTitle, item) {
  const txt =
    stripHtml(item.content) ||
    stripHtml(item.contentSnippet) ||
    "";

  return [
    { role: "system", content: SYSTEM },
    {
      role: "user",
      content: USER_ITEM({
        site: siteTitle,
        title: stripHtml(item.title || ""),
        url: item.link || "",
        text: txt,
        published: item.isoDate || item.pubDate || "",
        maxTitleWords: 12,
        minChars: MIN_SUMMARY_CHARS,
        maxChars: MAX_SUMMARY_CHARS,
      }),
    },
  ];
}

// The main rewrite logic has been moved to index.js
// This file now only serves as a collection of helper functions and constants.
// The original `runRewritePipeline` function is no longer here.
// We keep the exports for FEED_CUTOFF_HOURS and isRecent for index.js.

