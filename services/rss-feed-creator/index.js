// services/rss-feed-creator/index.js (new content based on reference-rewrite-pipeline.js with feed rotation logic)
import fetch from "node-fetch";
import Parser from "rss-parser";
import { log } from "#logger.js"; 
import { getObject, putJson } from "../shared/utils/r2-client.js"; 
import { callOpenRouterModel } from "./utils/models.js"; 
import { rebuildRss } from "./utils/feedGenerator.js"; 
import { SOURCE_FEED_CUTOFF_HOURS, isRecent } from "../rewrite-pipeline.js"; // Import cutoff logic from rewrite-pipeline

// Hardcoded cleanup for rewritten articles: 60 days
const REWRITTEN_CLEANUP_HOURS = 60 * 24;
import { createShortLink } from "./utils/shortio.js"; // Adjusted path for shortio
import { URL } from "url"; // Import URL for URL constructor

const parser = new Parser();

// R2 object keys (match repo layout in production)
const ITEMS_KEY = "items.json";
const FEEDS_KEY = "feeds.txt";
const URLS_KEY  = "urls.txt";
const CURSOR_KEY = "cursor.json";

// Batch limits
const FEEDS_PER_RUN = 5;    // rotate 5 feeds per run
const URLS_PER_RUN  = 1;    // rotate 1 direct URL per run
const MAX_ITEMS_PER_FEED = parseInt(process.env.MAX_ITEMS_PER_FEED || "3", 10);

// --- helpers ---------------------------------------------------------------

function parseList(text) {
  if (!text) return [];
  return text
    .split(/\r?\n/)
    .map(s => s.trim())
    .filter(s => s && !s.startsWith("#"));
}

function clampRewrite(s) {
  if (!s) return "";
  // strip obvious non-article junk (markdown headings, "Podcast", etc.)
  s = s.replace(/^#+\s*/gm, "")
       .replace(/\*\*[^*]+\*\*/g, "")
       .replace(/(?:^|\n)(?:Podcast|Intro|Headline)[:\-]/gi, "")
       .replace(/\n+/g, " ")
       .trim();
  // enforce 200–400 chars (prefer sentence end)
  const min = 200, max = 400;
  if (s.length <= max) return s;
  let cut = s.slice(0, max);
  const lastPunct = Math.max(cut.lastIndexOf("."), cut.lastIndexOf("!"), cut.lastIndexOf("?"));
  if (lastPunct >= min) {
    return cut.slice(0, lastPunct + 1).trim();
  }
  return cut.trim() + "…";
}

function guid() {
  return "RSS-" + Math.random().toString(36).slice(2, 8);
}

async function readJson(key, fallback) {
  const raw = await getObject(key);
  if (!raw) return fallback;
  try { return JSON.parse(raw); }
  catch { return fallback; }
}

function wrapIndex(start, count, arr) {
  if (arr.length === 0) return [];
  const out = [];
  for (let i = 0; i < count && i < arr.length; i++) {
    out.push(arr[(start + i) % arr.length]);
  }
  return out;
}

// --- core ------------------------------------------------------------------

export async function runRewritePipeline() {
  log.info("🚀 Starting rewrite pipeline");

  // 1) load sources from R2 + rotation cursor
  const [feedsText, urlsText, cursor] = await Promise.all([
    getObject(FEEDS_KEY),
    getObject(URLS_KEY),
    readJson(CURSOR_KEY, { feedIndex: 0, urlIndex: 0 })
  ]);

  const allFeeds = parseList(feedsText);
  const allUrls  = parseList(urlsText);

  log.info({ feeds: allFeeds.length, urls: allUrls.length }, "📥 Input lists loaded");

  const selectedFeeds = wrapIndex(cursor.feedIndex || 0, FEEDS_PER_RUN, allFeeds);
  const selectedUrls  = wrapIndex(cursor.urlIndex  || 0, URLS_PER_RUN,  allUrls);

  log.info({ selectedFeeds, selectedUrls }, "🎯 Selected sources for this run");

  // 2) start with the current items, filtering out old ones based on cutoff
  const allItems = await readJson(ITEMS_KEY, []);
  
  // Filter out items older than REWRITTEN_CLEANUP_HOURS (60 days)
  const cleanupTime = Date.now() - (REWRITTEN_CLEANUP_HOURS * 60 * 60 * 1000);
  const items = allItems.filter(item => item.ts > cleanupTime);

  log.info({ totalItems: allItems.length, keptItems: items.length, cleanupHours: REWRITTEN_CLEANUP_HOURS }, "🧹 Filtered old items from store");

  // 3) process feed items
  for (const feed of selectedFeeds) {
    log.info({ feed }, "🔗 Fetching RSS feed");
    try {
      const xml = await fetch(feed).then(r => r.text());
      const parsed = await parser.parseString(xml);
      log.info({ feed, items: parsed.items?.length || 0 }, "✅ RSS feed parsed successfully");

      const feedItems = parsed.items || [];
      // 3.1) Filter for recent articles (based on SOURCE_FEED_CUTOFF_HOURS) and take a slice
      const recentItems = feedItems.filter(it => isRecent(it.isoDate || it.pubDate || it.date, SOURCE_FEED_CUTOFF_HOURS));
      const slice = recentItems.slice(0, MAX_ITEMS_PER_FEED);
      
      log.info({ feed, recentItems: recentItems.length, processedItems: slice.length }, "📰 Processing recent articles");

      for (const it of slice) {
        const link = it.link || it.guid || it.id;
        const title = (it.title || "").trim();
        
        // Skip if link is missing or item is already in the current list
        if (!link) {
          log.warn({ feed, it }, "⚠️ Skipping item without link");
          continue;
        }
        if (items.some(x => x.url === link)) {
          log.info({ feed, link }, "⏭️ Item already exists, skipping rewrite");
          continue;
        }

        await rewriteAndStore({ url: link, title }, items);
      }
    } catch (err) {
      log.error({ feed, err }, "❌ Failed to fetch/parse RSS feed");
    }
  }

  // 4) process direct URLs
  for (const url of selectedUrls) {
    await rewriteAndStore({ url, title: null }, items);
  }

  // 5) persist items + rebuild rss
  await putJson(ITEMS_KEY, items);
  log.info({ key: ITEMS_KEY, count: items.length }, "💾 items.json saved");

  await rebuildRss(items);

  // 6) advance rotation cursor
  const next = {
    feedIndex: (cursor.feedIndex + selectedFeeds.length) % (allFeeds.length || 1),
    urlIndex:  (cursor.urlIndex  + selectedUrls.length)  % (allUrls.length  || 1),
  };
  await putJson(CURSOR_KEY, next);
  log.info({ next }, "🔁 Rotation cursor updated");

  log.info("🏁 Rewrite pipeline finished");
}

async function rewriteAndStore({ url, title }, items) {
  // sanity check
  try { new URL(url); } catch { log.warn({ url }, "⚠️ Invalid URL - skipped"); return; }

  log.info({ url, title }, "✍️ Rewriting content");
  let html = "";
  try {
    html = await fetch(url, { redirect: "follow" }).then(r => r.text());
  } catch (err) {
    log.error({ url, err }, "❌ Failed to fetch source page");
  }

  let rewritten = "";
  try {
    const raw = await callOpenRouterModel(url, html, title || "Untitled");
    rewritten = clampRewrite(raw);
    // ensure not empty
    if (!rewritten || rewritten.length < 20) {
      throw new Error("Empty/too short rewrite");
    }
  } catch (err) {
    log.error({ url, err }, "❌ Rewrite failed");
    return;
  }

  // Shorten URL (required for RSS link)
  let shortUrl = url;
  try {
    log.info({ url }, "🔗 Creating Short.io link");
    shortUrl = await createShortLink(url);
    log.info({ shortUrl }, "✅ Short.io link created");
  } catch (err) {
    log.warn({ url, err }, "⚠️ Short.io failed, falling back to original URL");
  }

  // Add item (persistence is handled by filtering old items at the start)
  const payload = {
    guid: guid(),
    url,
    shortUrl,
    title: title || "",
    rewrite: rewritten,
    ts: Date.now()
  };

  // The logic for 'adding' new items and 'not overwriting' is now:
  // 1. Filter out old items from R2 store at the start of the pipeline.
  // 2. Only process items that are recent (using isRecent) and not already in the filtered list.
  // 3. Add the new item to the list.
  items.push(payload);
  log.info({ url }, "➕ Added new item");
}

// Allow manual execution via CLI (node services/rss-feed-creator/index.js)
if (process.argv[1] && process.argv[1].endsWith("index.js")) {
  runRewritePipeline().catch((err) => {
    log.error("💥 RSS Feed Creator pipeline error", { err: err.message });
    process.exit(1);
  });
}

export default runRewritePipeline;

