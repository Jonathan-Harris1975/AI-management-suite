import { parseStringPromise, Builder } from "xml2js";
import { info, error } from "#logger.js";
import { putText } from "#shared/r2-client.js";
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
const FEED_CUTOFF_HOURS = Number(process.env.FEED_CUTOFF_HOURS || 24);
const MIN_SUMMARY_CHARS = Number(process.env.MIN_SUMMARY_CHARS || 350);
const MAX_SUMMARY_CHARS = Number(process.env.MAX_SUMMARY_CHARS || 800);

/**
 * Checks whether a feed item is recent enough to rewrite.
 */
function isRecent(pubDate, cutoffHours = FEED_CUTOFF_HOURS) {
  const d = new Date(pubDate || Date.now());
  if (Number.isNaN(d.getTime())) return false;
  return Date.now() - d.getTime() <= cutoffHours * 60 * 60 * 1000;
}

/**
 * Strips HTML tags and normalizes whitespace.
 */
function stripHtml(s = "") {
  return String(s).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

/**
 * Builds message array for a single RSS item.
 */
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
        site: siteTitle || "AI News",
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

/**
 * 🧠 Rewrite RSS feeds using the configured AI model.
 */
export async function runRewritePipeline(feedXml, options = {}) {
  const maxItemsPerFeed = Number(options.maxItemsPerFeed || process.env.MAX_ITEMS_PER_FEED || 20);
  const outputKey = "feed.xml";

  // 1️⃣ Parse RSS/Atom XML
  const src = await parseStringPromise(String(feedXml || ""), { explicitArray: false, mergeAttrs: true });
  const channel = src?.rss?.channel || src?.feed;
  if (!channel) throw new Error("Unrecognized RSS/Atom structure.");

  const siteTitle =
    stripHtml(channel.title || channel["title._"] || channel["title"]?.["_"] || "AI News");

  // 2️⃣ Normalize RSS entries
  let items = [];
  if (Array.isArray(channel.item)) items = channel.item;
  else if (channel.item) items = [channel.item];
  else if (Array.isArray(channel.entry)) items = channel.entry;
  else if (channel.entry) items = [channel.entry];

  const normalized = items.map((it) => {
    let link = "";
    if (it.link?.href) link = it.link.href;
    else if (typeof it.link === "string") link = it.link;
    else if (Array.isArray(it.link) && it.link.length) {
      const first = it.link[0];
      link = typeof first === "string" ? first : first?.href || "";
    } else if (it.guid && typeof it.guid === "string" && /^https?:\/\//i.test(it.guid)) {
      link = it.guid;
    }

    const summary =
      it["content:encoded"] ||
      it.contentSnippet ||
      it.description ||
      it.summary ||
      "";

    const pub =
      it.isoDate ||
      it.pubDate ||
      it.published ||
      it.updated ||
      it["dc:date"] ||
      "";

    return {
      title: it.title?._ || it.title || "",
      link,
      contentSnippet: summary,
      content: it.content?._ || it.content || "",
      isoDate: pub,
      pubDate: pub,
    };
  });

  // 3️⃣ Filter strictly for items within 24h (configurable)
  const fresh = normalized.filter((x) => isRecent(x.isoDate || x.pubDate));
  if (!fresh.length) {
    info(`⚠️ No items newer than ${FEED_CUTOFF_HOURS}h found — skipping rewrite.`);
    return { key: null, publicUrl: null, count: 0 };
  }

  const picked = fresh.slice(0, maxItemsPerFeed);
  info(`🧩 Rewriting ${picked.length} recent feed items via AI model...`);

  // 4️⃣ Rewrite with robust parsing and fallbacks
  const rewritten = [];
  for (const item of picked) {
    try {
      const messages = messagesForItem(siteTitle, item);
      const raw = await resolveModelRewriter(messages);

      let title = "";
      let summary = "";

      if (raw && typeof raw === "object" && ("title" in raw || "summary" in raw)) {
        title = String(raw.title || "");
        summary = String(raw.summary || "");
      } else if (typeof raw === "string") {
        const norm = normalizeModelText(raw);
        title = norm.title;
        summary = norm.summary;
      }

      // Fallbacks if model returns empty
      if (!title) title = stripHtml(item.title || "");
      if (!summary) summary = stripHtml(item.contentSnippet || item.content || "");

      title = clampTitleTo12Words(title);
      summary = clampSummaryToWindow(summary, MIN_SUMMARY_CHARS, MAX_SUMMARY_CHARS);

      let linkOut = item.link || "";
      if (linkOut) {
        try {
          linkOut = await shortenUrl(linkOut);
        } catch {
          /* ignore shortener failures */
        }
      }

      rewritten.push({
        title: title || "Update",
        link: linkOut,
        description: summary || "(No summary available)",
        pubDate: item.isoDate || item.pubDate || new Date().toUTCString(),
      });
    } catch (e) {
      error("❌ Item rewrite failed", { itemTitle: item.title, err: e.message });
    }
  }

  if (rewritten.length === 0) {
    info("⚠️ No valid rewritten items to publish — skipping upload.");
    return { key: null, publicUrl: null, count: 0 };
  }

  // 5️⃣ Build valid RSS feed
  const asciiDesc = `Summarized headlines from ${siteTitle}: titles <= 12 words; summaries ${MIN_SUMMARY_CHARS}-${MAX_SUMMARY_CHARS} chars.`;
  const rssObj = {
    rss: {
      $: { version: "2.0" },
      channel: {
        title: `${siteTitle} — AI Condensed`,
        link: R2_PUBLIC_BASE_URL ? `${R2_PUBLIC_BASE_URL}/feed.xml` : "",
        description: asciiDesc,
        lastBuildDate: new Date().toUTCString(),
        item: rewritten.map((r) => ({
          title: r.title,
          link: r.link,
          description: r.description,
          pubDate: r.pubDate,
        })),
      },
    },
  };

  const builder = new Builder({ cdata: true });
  const xmlOut = builder.buildObject(rssObj);

  // 6️⃣ Upload to R2
  info("☁️ Uploading rewritten feed to R2...");
  await putText(RSS_FEED_BUCKET, outputKey, xmlOut, "application/rss+xml");

  const publicUrl = R2_PUBLIC_BASE_URL ? `${R2_PUBLIC_BASE_URL}/feed.xml` : null;
  info("📤 Uploaded rewritten feed", { publicUrl });

  return { key: outputKey, publicUrl, count: rewritten.length };
}

export default runRewritePipeline;
