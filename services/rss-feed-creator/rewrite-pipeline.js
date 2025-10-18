// ============================================================
// 🔁 RSS Feed Rewrite / Rotation Pipeline (manual)
// ============================================================
//
// Inputs (files in repo):
//  - services/rss-feed-creator/data/feeds.txt
//  - services/rss-feed-creator/data/urls.txt
//
// Outputs:
//  - services/rss-feed-creator/utils/active-feeds.json   (local preview)
//  - services/rss-feed-creator/utils/feed-state.json     (local state)
//  - r2: rewritten/latest-feeds.json                     (for builder)
//
// Env/R2:
//  - Uses ../shared/utils/r2-client.js (R2_* vars are on Shiper)
// ============================================================

import fs from "fs";
import fsp from "fs/promises";
import path from "path";
import { getObjectAsText, putJson } from "../shared/utils/r2-client.js";
import { info, error } from "../shared/utils/logger.js";

const projectRoot = "/app";
const baseDir = path.join(projectRoot, "services/rss-feed-creator");
const dataDir = path.join(baseDir, "data");
const utilsDir = path.join(baseDir, "utils");

const LOCAL_ACTIVE = path.join(utilsDir, "active-feeds.json");
const LOCAL_STATE  = path.join(utilsDir, "feed-state.json");

// NOTE: Adjust bucket with your env layout.
// Prefer RSS feeds bucket; fall back to META.
const R2_BUCKET =
  process.env.R2_BUCKET_RSS_FEEDS ||
  process.env.R2_BUCKET_PODCAST_RSS_FEEDS ||
  process.env.R2_BUCKET_META;

/**
 * Rotate and persist the latest selection of feeds + a target URL.
 * Writes a compact manifest that downstream builder can consume.
 */
export async function rewriteRSSFeeds({ batchSize = 5 } = {}) {
  try {
    if (!fs.existsSync(utilsDir)) fs.mkdirSync(utilsDir, { recursive: true });

    const feedsPath = path.join(dataDir, "feeds.txt");
    const urlsPath  = path.join(dataDir, "urls.txt");

    if (!fs.existsSync(feedsPath) || !fs.existsSync(urlsPath)) {
      throw new Error("Missing feeds.txt or urls.txt in services/rss-feed-creator/data");
    }

    const feeds = (await fsp.readFile(feedsPath, "utf-8"))
      .split("\n").map(s => s.trim()).filter(Boolean);
    const urls  = (await fsp.readFile(urlsPath, "utf-8"))
      .split("\n").map(s => s.trim()).filter(Boolean);

    let state = { index: 0 };
    if (fs.existsSync(LOCAL_STATE)) {
      try { state = JSON.parse(await fsp.readFile(LOCAL_STATE, "utf-8")); }
      catch { state = { index: 0 }; }
    }

    const start = Number(state.index) || 0;
    const end   = Math.min(start + batchSize, feeds.length);
    const batch = feeds.slice(start, end);
    const urlIndex = Math.floor(start / batchSize) % Math.max(urls.length, 1);
    const targetUrl = urls[urlIndex];

    const nextIndex = end >= feeds.length ? 0 : end;

    // Local previews
    await fsp.writeFile(LOCAL_STATE, JSON.stringify({ index: nextIndex }, null, 2));
    await fsp.writeFile(LOCAL_ACTIVE, JSON.stringify({
      feeds: batch, targetUrl, batchStart: start, batchEnd: end, totalFeeds: feeds.length
    }, null, 2));

    // R2 manifest for builder
    const manifestKey = "rewritten/latest-feeds.json";
    const manifest = {
      generatedAt: new Date().toISOString(),
      feeds: batch,
      targetUrl,
      meta: { batchSize, batchStart: start, batchEnd: end, totalFeeds: feeds.length }
    };

    if (!R2_BUCKET) throw new Error("No R2 bucket configured for RSS rewrites (R2_BUCKET_RSS_FEEDS/R2_BUCKET_META).");
    await putJson(R2_BUCKET, manifestKey, manifest);

    info("🔁 RSS rewrite complete", {
      feedsUsed: batch.length,
      nextIndex,
      targetUrl,
      r2Bucket: R2_BUCKET,
      r2Key: manifestKey
    });

    return {
      ok: true,
      feedsUsed: batch.length,
      nextIndex,
      targetUrl,
      r2Bucket: R2_BUCKET,
      r2Key: manifestKey
    };
  } catch (err) {
    error("❌ RSS rewrite pipeline failed", { error: err.message });
    throw err;
  }
        
