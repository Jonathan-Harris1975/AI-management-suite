// services/rss-feed-creator/index.js
import Parser from "rss-parser";
import rssLogger from "./utils/rss-logger.js";
const info = (...args) => rssLogger.info(...args);
const error = (...args) => rssLogger.error(...args);
import { getObjectAsText, uploadBuffer } from "#shared/utils/r2-client.js";
import { resilientRequest } from "../shared/utils/ai-service.js";
import { RSS_PROMPTS } from "./utils/rss-prompts.js";

const parser = new Parser();

// ─────────────────────────────────────────────
// ⚙️ Load Feeds + URLs + Rotation from R2
// ─────────────────────────────────────────────
async function loadFeedSources() {
  const bucket = process.env.R2_BUCKET_RSS_FEEDS || "rss-feeds";

  const [feedsTxt, urlsTxt, rotationTxt] = await Promise.all([
    getObjectAsText(bucket, "data/rss-feeds.txt"),
    getObjectAsText(bucket, "data/url-feeds.txt"),
    getObjectAsText(bucket, "data/feed-rotation.json"),
  ]);

  const allFeeds = (feedsTxt || "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  const siteUrls = (urlsTxt || "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  const rotationIndex = parseInt(rotationTxt || "0", 10);

  if (!allFeeds.length) throw new Error("rss-feeds.txt is empty or missing.");
  if (!siteUrls.length) throw new Error("url-feeds.txt is empty or missing.");

  return { allFeeds, siteUrls, rotationIndex, bucket };
}

// ─────────────────────────────────────────────
// 🔄 Select feeds + site per run
// ─────────────────────────────────────────────
function selectFeeds({ allFeeds, siteUrls, rotationIndex }) {
  const MAX_FEEDS_PER_RUN = parseInt(process.env.MAX_FEEDS_PER_RUN || "5", 10);
  const totalFeeds = allFeeds.length;
  const start = rotationIndex % totalFeeds;

  const selectedFeeds = [];
  for (let i = 0; i < MAX_FEEDS_PER_RUN; i++) {
    const idx = (start + i) % totalFeeds;
    selectedFeeds.push(allFeeds[idx]);
  }

  const siteIndex = rotationIndex % siteUrls.length;
  const selectedSite = siteUrls[siteIndex];

  const nextRotationIndex = (rotationIndex + MAX_FEEDS_PER_RUN) % totalFeeds;

  info("rss.rotation", {
    selectedFeeds: selectedFeeds.length,
    selectedSite,
    nextRotationIndex,
  });

  return { selectedFeeds, selectedSite, nextRotationIndex };
}

// ─────────────────────────────────────────────
// 📰 Fetch and Filter Feed Items
// ─────────────────────────────────────────────
async function fetchFeedItems(feedUrl) {
  const MAX_ITEMS_PER_FEED = parseInt(process.env.MAX_ITEMS_PER_FEED || "6", 10);
  const FEED_CUTOFF_HOURS = parseInt(process.env.FEED_CUTOFF_HOURS || "24", 10);
  const cutoffDate = new Date(Date.now() - FEED_CUTOFF_HOURS * 60 * 60 * 1000);

  try {
    const feed = await parser.parseURL(feedUrl);
    const filtered = (feed.items || [])
      .filter((item) => {
        const pubDate = new Date(item.pubDate || item.isoDate || Date.now());
        return pubDate >= cutoffDate;
      })
      .slice(0, MAX_ITEMS_PER_FEED);

    info("rss.feed.filtered", {
      feedTitle: feed.title || "Unnamed Feed",
      originalCount: feed.items?.length || 0,
      kept: filtered.length,
    });

    return filtered;
  } catch (err) {
    error("rss.feed.error", { feedUrl, err: err.message });
    return [];
  }
}

// ─────────────────────────────────────────────
// ✍️ Rewrite Item via LLM
// ─────────────────────────────────────────────
async function rewriteItem(item) {
  const { SYSTEM, USER_ITEM, normalizeModelText, clampTitleTo12Words, clampSummaryToWindow } =
    RSS_PROMPTS;

  const userPrompt = USER_ITEM({
    site: item.site || "",
    title: item.title || "",
    url: item.link || "",
    text: item.contentSnippet || item.content || "",
    published: item.pubDate || "",
  });

  const messages = [
    { role: "system", content: SYSTEM },
    { role: "user", content: userPrompt },
  ];

  const raw = await callLLMChat({ route: "rssRewrite", messages });
  const { title, summary } = normalizeModelText(raw);

  return {
    title: clampTitleTo12Words(title),
    summary: clampSummaryToWindow(summary),
    link: item.link,
    date: item.pubDate || item.isoDate || new Date().toISOString(),
  };
}

// ─────────────────────────────────────────────
// 🧠 Main Orchestrator
// ─────────────────────────────────────────────
export async function runRssRewriter() {
  try {
    info("rss.orchestrate.start");

    const { allFeeds, siteUrls, rotationIndex, bucket } = await loadFeedSources();
    const { selectedFeeds, selectedSite, nextRotationIndex } = selectFeeds({
      allFeeds,
      siteUrls,
      rotationIndex,
    });

    const allItems = [];
    for (const feedUrl of selectedFeeds) {
      const items = await fetchFeedItems(feedUrl);
      allItems.push(...items.map((i) => ({ ...i, site: selectedSite })));
    }

    const rewritten = [];
    for (const item of allItems) {
      try {
        const r = await rewriteItem(item);
        rewritten.push(r);
      } catch (err) {
        error("rss.item.fail", { title: item.title, err: err.message });
      }
    }

    // 🗂️ Build RSS XML
    const xml = buildRssXml(rewritten);

    // ☁️ Upload new feed + rotation index to R2
    await Promise.all([
      uploadBuffer(bucket, "feed.xml", Buffer.from(xml, "utf8")),
      uploadBuffer(bucket, "data/feed-rotation.json", Buffer.from(String(nextRotationIndex), "utf8")),
    ]);

    info("rss.orchestrate.done", {
      itemCount: rewritten.length,
      nextRotationIndex,
    });

    return { ok: true, items: rewritten.length, xmlLength: xml.length };
  } catch (err) {
    error("rss.orchestrate.fail", { err: err.message });
    return { ok: false, error: err.message };
  }
}

// ─────────────────────────────────────────────
// 🧱 Helper: RSS XML Builder
// ─────────────────────────────────────────────
function buildRssXml(items = []) {
  const channelTitle = "Turing’s Torch: AI Weekly (Rewritten Feed)";
  const channelLink = "https://jonathan-harris.online";
  const channelDesc = "AI news summaries rewritten in a Gen-X British tone.";

  const entries = items
    .map(
      (item) => `
    <item>
      <title>${escapeXml(item.title)}</title>
      <link>${item.link}</link>
      <pubDate>${item.date}</pubDate>
      <description>${escapeXml(item.summary)}</description>
    </item>`
    )
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
  <rss version="2.0">
    <channel>
      <title>${channelTitle}</title>
      <link>${channelLink}</link>
      <description>${channelDesc}</description>
      ${entries}
    </channel>
  </rss>`;
}

function escapeXml(s = "") {
  return s.replace(/[<>&'"]/g, (c) =>
    ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" }[c])
  );
}

export default runRssRewriter;
