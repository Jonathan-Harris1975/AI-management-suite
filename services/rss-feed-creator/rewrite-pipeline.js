// services/rss-feed-creator/rewrite-pipeline.js
import { parseStringPromise, Builder } from "xml2js";
import { info, error } from "#logger.js";
import { putText } from "#shared/r2-client.js";
import { resolveModelRewriter } from "./utils/models.js";
import { shortenUrl } from "./utils/shortio.js";
import { RSS_PROMPTS } from "./utils/rss-prompts.js";

const RSS_FEED_BUCKET = process.env.R2_BUCKET_RSS_FEEDS || "";
const R2_PUBLIC_BASE_URL = process.env.R2_PUBLIC_BASE_URL_RSS || "";
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

function isRecent(pubDate) {
  const d = new Date(pubDate || Date.now());
  if (isNaN(d.getTime())) return false;
  return Date.now() - d.getTime() < ONE_DAY_MS;
}

function clampSummary(text) {
  if (!text) return "";
  // target 250–600 chars; clamp hard if LLM overshoots
  const t = text.trim().replace(/\s+/g, " ");
  if (t.length < 250) return t; // keep; too short is allowed but we warned LLM
  if (t.length <= 600) return t;
  // try to cut at sentence boundary near 600
  const cutoff = t.lastIndexOf(".", 600);
  return cutoff > 450 ? t.slice(0, cutoff + 1) : t.slice(0, 600);
}

function clampTitle(title) {
  if (!title) return "";
  const words = title.trim().split(/\s+/);
  if (words.length <= 12) return title.trim();
  return words.slice(0, 12).join(" ");
}

/**
 * Build LLM messages for one item using existing prompt pack
 */
function messagesForItem(siteTitle, item) {
  const { title, link, contentSnippet, content, isoDate, pubDate } = item;
  const txt = content?.trim?.() || contentSnippet?.trim?.() || "";
  return [
    { role: "system", content: RSS_PROMPTS.SYSTEM },
    {
      role: "user",
      content: RSS_PROMPTS.USER_ITEM({
        site: siteTitle || "AI News",
        title: title || "",
        url: link || "",
        text: txt,
        // keep constraints visible to the model
        maxTitleWords: 12,
        minChars: 250,
        maxChars: 600,
        published: isoDate || pubDate || "",
      }),
    },
  ];
}

/**
 * 🧠 Rewrite RSS feeds using the configured AI model, then upload to R2
 * @param {string} feedXml - Raw RSS/Atom XML string
 * @param {Object} [options]
 * @param {string} [options.fileName]
 * @param {number} [options.maxItemsPerFeed]
 * @returns {Promise<Object>}
 */
export async function runRewritePipeline(feedXml, options = {}) {
  const maxItemsPerFeed = Number(options.maxItemsPerFeed || process.env.MAX_ITEMS_PER_FEED || 20);
  const fileName = options.fileName?.endsWith(".xml") ? options.fileName : `${(options.fileName || "rewritten")}.xml`;

  // 1) Parse incoming RSS/Atom
  const src = await parseStringPromise(feedXml, { explicitArray: false, mergeAttrs: true });
  const channel = src?.rss?.channel || src?.feed; // rss or atom
  if (!channel) throw new Error("Unrecognized RSS/Atom structure.");

  const siteTitle =
    channel.title ||
    channel["title._"] ||
    channel["title"]?.["_"] ||
    "AI News";

  // Normalize items array across RSS/Atom shapes
  let items = [];
  if (Array.isArray(channel.item)) items = channel.item;
  else if (channel.item) items = [channel.item];
  else if (Array.isArray(channel.entry)) items = channel.entry;
  else if (channel.entry) items = [channel.entry];

  // Map items to a convenient shape (title/link/summary/date)
  const normalized = items.map((it) => {
    const link =
      it.link?.href ||
      (typeof it.link === "string" ? it.link : it.link?.[0]) ||
      it.guid ||
      "";

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

  // 2) Recent-first; fallback to newest N if no recent
  const recent = normalized.filter((x) => isRecent(x.isoDate || x.pubDate));
  let picked = recent;
  if (picked.length === 0) {
    // sort by date desc, pick top N
    picked = [...normalized].sort((a, b) => {
      const ta = new Date(a.isoDate || a.pubDate || 0).getTime();
      const tb = new Date(b.isoDate || b.pubDate || 0).getTime();
      return tb - ta;
    });
  }
  picked = picked.slice(0, maxItemsPerFeed);

  info(`🧩 Rewriting ${picked.length} feed items via AI model...`);

  // 3) Rewrite each item via your configured LLM route
  const rewritten = [];
  for (const item of picked) {
    try {
      const messages = messagesForItem(siteTitle, item);
      const raw = await resolveModelRewriter(messages);
      // Expecting JSON back: { title, summary }
      let title = clampTitle(raw?.title || "");
      let summary = clampSummary(raw?.summary || "");
      if (!title) {
        // fallback: trim original title to 12 words
        title = clampTitle(item.title || "");
      }
      if (!summary) {
        // fallback: trim original snippet to max window
        summary = clampSummary(item.contentSnippet || item.content || "");
      }

      // Shorten URL if available
      const link = item.link ? await shortenUrl(item.link).catch(() => item.link) : "";

      rewritten.push({
        title,
        link,
        description: summary,
        pubDate: item.isoDate || item.pubDate || new Date().toUTCString(),
      });
    } catch (e) {
      error("❌ Item rewrite failed", { err: e.message, itemTitle: item.title });
    }
  }

  // If still nothing, bail gracefully
  if (rewritten.length === 0) {
    info("⚠️ No items to publish after rewriting; uploading is skipped.");
    return { key: null, publicUrl: null, count: 0 };
  }

  // 4) Build minimal valid RSS 2.0
  const rssObj = {
    rss: {
      $: { version: "2.0" },
      channel: {
        title: `${siteTitle} — AI Condensed`,
        link: "",
        description: `Summarized headlines from ${siteTitle} (titles ≤ 12 words; summaries 250–600 chars).`,
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

  // 5) Upload to R2
  info("☁️ Uploading rewritten feed to R2...");
  await putText(RSS_FEED_BUCKET, fileName, xmlOut, "application/rss+xml");
  const publicUrl = R2_PUBLIC_BASE_URL
    ? `${R2_PUBLIC_BASE_URL.replace(/\/+$/, "")}/${fileName}`
    : null;

  info("📤 Uploaded rewritten feed", { publicUrl });
  return { key: fileName, publicUrl, count: rewritten.length };
}

export default runRewritePipeline;
