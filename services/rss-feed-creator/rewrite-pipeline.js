// /services/rss-feed-creator/rewrite-pipeline.js
// 🔁 AI Podcast Suite – RSS Feed Rewrite Pipeline (2025.10.11)

import fs from "node:fs";
import path from "node:path";
import Parser from "rss-parser";
import { getObject, putJson, putText } from "../shared/utils/r2-client.js";
import { callOpenRouterModel } from "../utils/models.js";
import { rebuildRss } from "./build-rss.js";

const parser = new Parser();
const fetch = globalThis.fetch;

// ────────────────────────────────────────────────
// Safe structured logger (Render-compatible)
// ────────────────────────────────────────────────
function safeLog(level, message, meta = null) {
  try {
    const entry = {
      time: new Date().toISOString(),
      level,
      message,
      ...(meta && typeof meta === "object" ? { meta } : {}),
    };
    process.stdout.write(JSON.stringify(entry) + "\n");
  } catch {
    process.stdout.write(
      JSON.stringify({ time: new Date().toISOString(), level, message }) + "\n"
    );
  }
}

// ── Constants
const ITEMS_KEY  = "items.json";
const FEEDS_KEY  = "feeds.txt";
const URLS_KEY   = "urls.txt";
const CURSOR_KEY = "cursor.json";
const FEEDS_PER_RUN      = 5;
const URLS_PER_RUN       = 1;
const MAX_ITEMS_PER_FEED = parseInt(process.env.MAX_ITEMS_PER_FEED || "3", 10);

// ────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────
function parseList(text) {
  if (!text) return [];
  return text.split(/\r?\n/).map(s => s.trim()).filter(s => s && !s.startsWith("#"));
}

function clampRewrite(s) {
  if (!s) return "";
  s = s.replace(/^#+\s*/gm, "")
       .replace(/\*\*[^*]+\*\*/g, "")
       .replace(/(?:^|\n)(?:Podcast|Intro|Headline)[:\-]/gi, "")
       .replace(/\n+/g, " ")
       .trim();
  const min = 200, max = 400;
  if (s.length <= max) return s;
  const cut = s.slice(0, max);
  const lastPunct = Math.max(cut.lastIndexOf("."), cut.lastIndexOf("!"), cut.lastIndexOf("?"));
  return (lastPunct >= min ? cut.slice(0, lastPunct + 1) : cut) + "…";
}

const guid = () => "RSS-" + Math.random().toString(36).slice(2, 8);
const wrapIndex = (start, count, arr) =>
  Array.from({ length: Math.min(count, arr.length) }, (_, i) => arr[(start + i) % arr.length]);

// ────────────────────────────────────────────────
async function ensureR2Bootstrap() {
  const baseDir = path.resolve("services/rss-feed-creator/data");
  const feedsPath = path.join(baseDir, "feeds.txt");
  const urlsPath = path.join(baseDir, "urls.txt");

  try {
    const [existingFeeds, existingUrls, existingCursor] = await Promise.all([
      getObject(FEEDS_KEY),
      getObject(URLS_KEY),
      getObject(CURSOR_KEY),
    ]);

    if (!existingFeeds && fs.existsSync(feedsPath))
      await putText(FEEDS_KEY, fs.readFileSync(feedsPath, "utf-8"));
    if (!existingUrls && fs.existsSync(urlsPath))
      await putText(URLS_KEY, fs.readFileSync(urlsPath, "utf-8"));
    if (!existingCursor)
      await putJson(CURSOR_KEY, { feedIndex: 0, urlIndex: 0 });
  } catch (err) {
    safeLog("error", "❌ Bootstrap to R2 failed", { error: err.message });
  }
}

// ────────────────────────────────────────────────
export async function runRewritePipeline() {
  safeLog("info", "🚀 Starting rewrite pipeline");

  try {
    await ensureR2Bootstrap();

    const [feedsText, urlsText, cursorRaw] = await Promise.all([
      getObject(FEEDS_KEY),
      getObject(URLS_KEY),
      getObject(CURSOR_KEY),
    ]);

    const feeds = parseList(feedsText);
    const urls = parseList(urlsText);
    const cursor = cursorRaw ? JSON.parse(cursorRaw) : { feedIndex: 0, urlIndex: 0 };

    if (!feeds.length && !urls.length)
      throw new Error("feeds.txt and urls.txt are empty or missing");

    const feedsSlice = wrapIndex(cursor.feedIndex, FEEDS_PER_RUN, feeds);
    const urlsSlice  = wrapIndex(cursor.urlIndex,  URLS_PER_RUN,  urls);
    safeLog("info", "📡 Selection", { feeds: feedsSlice.length, urls: urlsSlice.length });

    const fetchedFeeds = [];
    for (const feedUrl of feedsSlice) {
      try {
        const resp = await fetch(feedUrl);
        const xml = await resp.text();
        const parsed = await parser.parseStringPromise(xml);
        fetchedFeeds.push(parsed);
        safeLog("info", "✅ Parsed feed", { url: feedUrl, items: parsed.items?.length || 0 });
      } catch (err) {
        safeLog("error", "❌ Failed to fetch/parse feed", { url: feedUrl, error: err.message });
      }
    }

    const rewrittenItems = [];
    for (const feed of fetchedFeeds) {
      for (const item of (feed.items || []).slice(0, MAX_ITEMS_PER_FEED)) {
        const title = item.title || "(untitled)";
        const snippet = item.contentSnippet || item.content || "";
        const prompt = `Rewrite this AI news headline and summary in a concise British Gen-X tone.\n\nTitle: ${title}\nSummary: ${snippet}`;
        try {
          const modelResp = await callOpenRouterModel(prompt);
          const rewritten = clampRewrite(modelResp);
          rewrittenItems.push({
            id: guid(),
            title: rewritten,
            link: item.link,
            pubDate: item.pubDate || new Date().toUTCString(),
            original: title,
          });
        } catch (err) {
          safeLog("error", "❌ Rewrite failed", { title, error: err.message });
        }
      }
    }

    const nextCursor = {
      feedIndex: (cursor.feedIndex + FEEDS_PER_RUN) % (feeds.length || 1),
      urlIndex:  (cursor.urlIndex + URLS_PER_RUN)  % (urls.length || 1),
    };
    await putJson(CURSOR_KEY, nextCursor);
    await putJson(ITEMS_KEY, rewrittenItems);
    await rebuildRss(rewrittenItems);

    safeLog("info", "🎯 Rewrite pipeline completed successfully");
    return { ok: true, count: rewrittenItems.length };
  } catch (err) {
    safeLog("error", "❌ runRewritePipeline failed", { error: err.message });
    throw err;
  }
      
