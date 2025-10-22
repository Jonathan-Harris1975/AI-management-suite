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
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

function isRecent(pubDate) {
  const d = new Date(pubDate || Date.now());
  if (Number.isNaN(d.getTime())) return false;
  return Date.now() - d.getTime() < ONE_DAY_MS;
}

function stripHtml(s = "") {
  return String(s).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

/**
 * Build LLM messages for one item using prompt pack.
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
        minChars: 250,
        maxChars: 600,
      }),
    },
  ];
}

/**
 * 🧠 Rewrite RSS feeds using your configured model, then upload as feed.xml to R2.
 * @param {string} feedXml - Raw RSS/Atom XML
 * @param {Object} [options]
 * @param {number} [options.maxItemsPerFeed]
 * @returns {Promise<{key:string|null, publicUrl:string|null, count:number}>}
 */
export async function runRewritePipeline(feedXml, options = {}) {
  const maxItemsPerFeed = Number(options.maxItemsPerFeed || process.env.MAX_ITEMS_PER_FEED || 20);
  const outputKey = "feed.xml"; // stable output as requested

  // 1) Parse incoming RSS/Atom
  const src = await parseStringPromise(String(feedXml || ""), { explicitArray: false, mergeAttrs: true });
  const channel = src?.rss?.channel || src?.feed;
  if (!channel) throw new Error("Unrecognized RSS/Atom structure.");

  const siteTitle =
    stripHtml(channel.title || channel["title._"] || channel["title"]?.["_"] || "AI News");

  // Normalize items array across RSS/Atom shapes
  let items = [];
  if (Array.isArray(channel.item)) items = channel.item;
  else if (channel.item) items = [channel.item];
  else if (Array.isArray(channel.entry)) items = channel.entry;
  else if (channel.entry) items = [channel.entry];

  // Map items to a consistent shape
  const normalized = items.map((it) => {
    // normalize link
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

  // 2) Recent-first; fallback to newest N if none recent
  const recent = normalized.filter((x) => isRecent(x.isoDate || x.pubDate));
  let picked = recent.length ? recent : [...normalized].sort((a, b) => {
    const ta = new Date(a.isoDate || a.pubDate || 0).getTime();
    const tb = new Date(b.isoDate || b.pubDate || 0).getTime();
    return tb - ta;
  });

  picked = picked.slice(0, maxItemsPerFeed);

  info(`🧩 Rewriting ${picked.length} feed items via AI model...`);

  // 3) Rewrite via model with robust parsing and fallbacks
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

      // Hard fallbacks from original content if model is empty
      if (!title) title = stripHtml(item.title || "");
      if (!summary) summary = stripHtml(item.contentSnippet || item.content || "");

      // Clamp to constraints
      title = clampTitleTo12Words(title);
      summary = clampSummaryToWindow(summary, 250, 600);

      // Shorten URL (best-effort)
      let linkOut = item.link || "";
      if (linkOut) {
        try {
          linkOut = await shortenUrl(linkOut);
        } catch {
          /* keep original link if shortener fails */
        }
      }

      // Ensure we have something meaningful
      if (!title) title = "Update";
      if (!summary) summary = "(No summary available)";

      rewritten.push({
        title,
        link: linkOut,
        description: summary,
        pubDate: item.isoDate || item.pubDate || new Date().toUTCString(),
      });
    } catch (e) {
      error("❌ Item rewrite failed", { itemTitle: item.title, err: e.message });
    }
  }

  if (rewritten.length === 0) {
    info("⚠️ No items to publish after rewriting; uploading is skipped.");
    return { key: null, publicUrl: null, count: 0 };
  }

  // 4) Build minimal valid RSS 2.0 (ASCII for safety to avoid encoding artifacts)
  const asciiDesc = `Summarized headlines from ${siteTitle}: titles <= 12 words; summaries 250-600 chars.`;

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

  // 5) Upload to R2 (always to feed.xml)
  info("☁️ Uploading rewritten feed to R2...");
  await putText(RSS_FEED_BUCKET, outputKey, xmlOut, "application/rss+xml");

  const publicUrl = R2_PUBLIC_BASE_URL ? `${R2_PUBLIC_BASE_URL}/feed.xml` : null;
  info("📤 Uploaded rewritten feed", { publicUrl });

  return { key: outputKey, publicUrl, count: rewritten.length };
}

export default runRewritePipeline;
