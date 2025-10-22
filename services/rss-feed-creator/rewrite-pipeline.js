import { parseStringPromise, Builder } from "xml2js";
import { info, error } from "#logger.js";
import { putText } from "#shared/r2-client.js";
import { resolveModelRewriter } from "./utils/models.js";
import { shortenUrl } from "./utils/shortio.js";
import { RSS_PROMPTS, buildRSSUserPrompt, normalizeRewrittenItem } from "./utils/rss-prompts.js";

const RSS_FEED_BUCKET = process.env.R2_BUCKET_RSS_FEEDS || "";
const R2_PUBLIC_BASE_URL = process.env.R2_PUBLIC_BASE_URL_RSS || "";
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

function isRecent(pubDate) {
  const d = new Date(pubDate || Date.now());
  if (isNaN(d.getTime())) return false;
  return Date.now() - d.getTime() < ONE_DAY_MS;
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
  const fileName = options.fileName?.endsWith(".xml")
    ? options.fileName
    : `${(options.fileName || "rewritten")}.xml`;

  // 1️⃣ Parse incoming RSS/Atom feed
  const src = await parseStringPromise(feedXml, { explicitArray: false, mergeAttrs: true });
  const channel = src?.rss?.channel || src?.feed;
  if (!channel) throw new Error("Unrecognized RSS/Atom structure.");

  const siteTitle =
    channel.title || channel["title._"] || channel["title"]?.["_"] || "AI News";

  // 2️⃣ Normalize items
  let items = [];
  if (Array.isArray(channel.item)) items = channel.item;
  else if (channel.item) items = [channel.item];
  else if (Array.isArray(channel.entry)) items = channel.entry;
  else if (channel.entry) items = [channel.entry];

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

  // 3️⃣ Filter or sort recent items
  const recent = normalized.filter((x) => isRecent(x.isoDate || x.pubDate));
  let picked = recent.length > 0
    ? recent
    : [...normalized].sort(
        (a, b) =>
          new Date(b.isoDate || b.pubDate || 0) -
          new Date(a.isoDate || a.pubDate || 0)
      );
  picked = picked.slice(0, maxItemsPerFeed);

  info(`🧩 Rewriting ${picked.length} feed items via AI model...`);

  // 4️⃣ Rewrite via model
  const rewritten = [];
  for (const item of picked) {
    try {
      const userPrompt = buildRSSUserPrompt(item);
      const messages = [
        { role: "system", content: RSS_PROMPTS },
        { role: "user", content: userPrompt },
      ];

      const rawText = await resolveModelRewriter(messages);
      const normalized = normalizeRewrittenItem(rawText);

      const title = normalized.title || item.title;
      const summary = normalized.summary || item.contentSnippet || item.content;

      // Shorten URL if available
      const link = item.link ? await shortenUrl(item.link).catch(() => item.link) : "";

      rewritten.push({
        title,
        link,
        description: summary,
        pubDate: item.isoDate || item.pubDate || new Date().toUTCString(),
      });
    } catch (e) {
      error("❌ Item rewrite failed", { itemTitle: item.title, err: e.message });
    }
  }

  if (rewritten.length === 0) {
    info("⚠️ No items to publish after rewriting; upload skipped.");
    return { key: null, publicUrl: null, count: 0 };
  }

  // 5️⃣ Build new RSS 2.0 feed
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

  // 6️⃣ Upload to R2
  info("☁️ Uploading rewritten feed to R2...");
  await putText(RSS_FEED_BUCKET, fileName, xmlOut, "application/rss+xml");

  const publicUrl = R2_PUBLIC_BASE_URL
    ? `${R2_PUBLIC_BASE_URL.replace(/\/+$/, "")}/${fileName}`
    : null;

  info("📤 Uploaded rewritten feed", { publicUrl });
  return { key: fileName, publicUrl, count: rewritten.length };
}

export default runRewritePipeline;
