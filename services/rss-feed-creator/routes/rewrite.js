// ============================================================
// 🧠 AI Podcast Suite — RSS Rewrite Route
// ============================================================
// Fetches next RSS feed URL from rotation, downloads it from the web,
// runs the rewrite pipeline, and updates rotation index in R2.
// ============================================================

import express from "express";
import fetch from "node-fetch";
import runRewritePipeline from "../rewrite-pipeline.js";
import { info, error } from "#logger.js";
import { ensureR2Sources, saveRotation } from "../utils/rss-bootstrap.js";

const router = express.Router();

router.post("/rewrite", async (req, res) => {
  try {
    let { feedXml, fileName, maxItemsPerFeed } = req.body || {};

    // ✅ Step 1: If feedXml not provided, rotate and fetch from web
    if (!feedXml) {
      info("⚙️ No feedXml provided — fetching next RSS feed from R2 rotation...");

      const { feeds, rotation } = await ensureR2Sources();

      if (!feeds || feeds.length === 0) {
        throw new Error("No feeds available for rewrite.");
      }

      // Calculate next index and update rotation
      const index = rotation?.lastIndex ?? 0;
      const nextIndex = (index + 1) % feeds.length;
      await saveRotation(nextIndex);

      const feedUrl = feeds[index].trim();
      info(`📡 Using feed [${index + 1}/${feeds.length}]: ${feedUrl}`);

      // ✅ Fetch feed XML directly from the web (not R2)
      info("🌐 Downloading RSS feed from remote URL...");
      const response = await fetch(feedUrl, { timeout: 15000 });

      if (!response.ok) {
        throw new Error(`Failed to fetch ${feedUrl}: HTTP ${response.status}`);
      }

      feedXml = await response.text();

      if (!feedXml || !feedXml.trim().startsWith("<")) {
        throw new Error(`Invalid RSS XML received from ${feedUrl}`);
      }

      // Use a safe filename
      const hostPart = new URL(feedUrl).hostname.replace(/\W+/g, "_");
      fileName = `rewritten-${hostPart}-${Date.now()}.xml`;

      info(`✅ Successfully downloaded feed: ${feedUrl}`);
    }

    // ✅ Step 2: Run rewrite pipeline
    info("📰 RSS rewrite requested");
    const result = await runRewritePipeline(feedXml, {
      fileName,
      maxItemsPerFeed: Number(maxItemsPerFeed) || 20,
    });

    // ✅ Step 3: Respond
    res.status(200).json({
      success: true,
      feedFile: fileName,
      itemsProcessed: result?.items?.length || 0,
    });
  } catch (err) {
    error("💥 RSS rewrite failed", {
      message: err.message,
      stack: err.stack,
    });

    res.status(500).json({
      success: false,
      error: err.message,
      stack: process.env.NODE_ENV !== "Production" ? err.stack : undefined,
    });
  }
});

export default router;
