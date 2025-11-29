/**
 * rewrite.js
 * Handles POST /rss/rewrite — fetches, rewrites, and regenerates the RSS feed.
 */

import express from "express";
import { endToEndRewrite } from "../rewrite-pipeline.js";
import { getObjectAsText } from "../../shared/utils/r2-client.js";
import { info, error, debug } from "#logger.js";

const router = express.Router();

router.post("/rewrite", async (req, res) => {
  try {
    info("rewrite.route.start");

    const bucket = process.env.R2_BUCKET_RSS_FEEDS || "rss-feeds";
    const key = "data/rss-feeds.txt";

    // Load RSS feed list from R2 if cache is empty
    if (!globalThis.__latestFetchedItems || !globalThis.__latestFetchedItems.length) {
      debug("rewrite.route.loading.feeds", { bucket, key });
      const feedText = await getObjectAsText(bucket, key);
      if (!feedText) throw new Error("rss-feeds.txt missing in R2");
      const urls = feedText
        .split("\n")
        .map((u) => u.trim())
        .filter((u) => u.length);
      globalThis.__latestFetchedItems = urls.map((u) => ({
        title: `Placeholder from ${u}`,
        link: u,
        guid: u,
        pubDate: new Date().toUTCString(),
        summary: "Fetched placeholder awaiting rewrite",
      }));
      debug("rewrite.route.loaded.urls", { count: urls.length });
    }

    // Execute rewrite pipeline
    const result = await endToEndRewrite();

    info("rewrite.route.complete", { result });

    res.json({
      status: "ok",
      message: "RSS rewrite process triggered successfully",
      itemsProcessed: result?.rewrittenItems?.length || 0,
    });
  } catch (err) {
    error("rewrite.route.error", err);
    res.status(500).json({ error: err.message || "Rewrite route failed" });
  }
});

// ✅ Default export for Express loader compatibility
export default router;
