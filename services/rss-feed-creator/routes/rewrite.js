// services/rss-feed-creator/routes/rewrite.js
import express from "express";
import runRewritePipeline from "../rewrite-pipeline.js";
import { info, error } from "#logger.js";
import { ensureR2Sources, saveRotation } from "../utils/rss-bootstrap.js";
import { getObjectAsText } from "../../shared/utils/r2-client.js";

const router = express.Router();

router.post("/rewrite", async (req, res) => {
  try {
    let { feedXml, fileName, maxItemsPerFeed } = req.body || {};

    // ✅ Step 1: Auto-load feed if not passed in request body
    if (!feedXml) {
      info("⚙️ No feedXml provided — fetching next RSS feed from R2 rotation...");

      const { feeds, urls, rotation } = await ensureR2Sources();

      // Determine current index and move to next rotation
      const index = rotation?.lastIndex || 0;
      const nextIndex = (index + 1) % feeds.length;
      await saveRotation(nextIndex);

      const feedKey = feeds[index];
      info(`📡 Using feed [${index + 1}/${feeds.length}]: ${feedKey}`);

      // ✅ Load RSS XML content from R2
      feedXml = await getObjectAsText(feedKey);
      fileName = `rewritten-${feedKey.replace(/\.[^.]+$/, "")}-${Date.now()}.xml`;
    }

    if (typeof feedXml !== "string" || !feedXml.trim().startsWith("<")) {
      throw new Error("Missing or invalid 'feedXml' string (R2 source invalid or empty).");
    }

    // ✅ Step 2: Pass to the existing rewrite pipeline
    info("📰 RSS rewrite requested");
    const result = await runRewritePipeline(feedXml, { fileName, maxItemsPerFeed });

    // ✅ Step 3: Return structured result
    res.status(200).json({ success: true, result });
  } catch (err) {
    error("💥 RSS rewrite failed", { message: err.message, stack: err.stack });
    res.status(500).json({
      success: false,
      error: err.message,
      stack: process.env.NODE_ENV !== "Production" ? err.stack : undefined,
    });
  }
});

export default router;
