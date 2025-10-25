// ==========================================================
// 🧠 RSS Feed Rewriter — AI Podcast Suite
// ----------------------------------------------------------
// Fetches next feed from rotation in R2, downloads raw XML,
// rewrites each item using LLM model, and uploads feed.xml.
// ==========================================================

import { Router } from "express";
import { info, error } from "#logger.js";
import { getObjectAsText, putText } from "#shared/r2-client.js";
import { fetchWithTimeout } from "../../shared/http-client.js";
import { runRewritePipeline } from "../index.js";

const router = Router();
const RSS_FEED_BUCKET = process.env.R2_BUCKET_RSS_FEEDS || "";
const ROTATION_FILE = "data/feed-rotation.json";
const RSS_LIST_FILE = "data/rss-feeds.txt";

// ==========================================================
// Utility: Load next RSS feed from rotation
// ==========================================================
async function loadNextFeed() {
  try {
    info("⚙️ No feedXml provided — fetching next RSS feed from R2 rotation...");
    info("🪣 Using R2 bucket:", RSS_FEED_BUCKET);

    const feedsTxt = await getObjectAsText(RSS_FEED_BUCKET, RSS_LIST_FILE);
    if (!feedsTxt) throw new Error("rss-feeds.txt missing or empty.");
    const feeds = feedsTxt.split(/\r?\n/).filter(Boolean);

    // rotation index
    let rotation = 0;
    try {
      const rotationJson = await getObjectAsText(RSS_FEED_BUCKET, ROTATION_FILE);
      if (rotationJson) rotation = JSON.parse(rotationJson).index || 0;
    } catch {
      rotation = 0;
    }

    // pick feed & advance
    const feedUrl = feeds[rotation % feeds.length];
    const next = (rotation + 1) % feeds.length;
    await putText(
      RSS_FEED_BUCKET,
      ROTATION_FILE,
      JSON.stringify({ index: next }),
      "application/json"
    );

    info(`📡 Using feed [${rotation + 1}/${feeds.length}]: ${feedUrl}`);
    return feedUrl;
  } catch (err) {
    error("💥 Failed to load feed rotation", { err: err.message });
    throw err;
  }
}

// ==========================================================
// Route: POST /rewrite
// ==========================================================
router.post("/rewrite", async (req, res) => {
  try {
    let feedXml = req.body?.feedXml;
    let feedUrl = req.body?.feedUrl;

    if (!feedXml) {
      // get next feed URL from R2 rotation
      feedUrl = feedUrl || (await loadNextFeed());
      info("🌐 Downloading RSS feed from remote URL...");
      const response = await fetchWithTimeout(feedUrl, { timeout: 15000 });
      if (!response.ok) {
        throw new Error(`Failed to download ${feedUrl}: HTTP ${response.status}`);
      }
      feedXml = await response.text();
    }

    info("📰 RSS rewrite requested");
    const result = await runRewritePipeline(feedXml);

    res.json({
      success: true,
      rewritten: result.count,
      publicUrl: result.publicUrl,
    });
  } catch (err) {
    error("💥 RSS rewrite failed", { message: err.message, stack: err.stack });
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
