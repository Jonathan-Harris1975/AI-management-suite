// services/rss-feed-creator/routes/rewrite.js
import express from "express";
import runRewritePipeline from "../rewrite-pipeline.js";
import { info, error } from "#logger.js";

const router = express.Router();

/**
 * POST /rss/rewrite
 * Expected body:
 * {
 *   "feedXml": "<rss>...</rss>",
 *   "fileName": "optional.xml",
 *   "maxItemsPerFeed": 20
 * }
 */
router.post("/rewrite", async (req, res) => {
  try {
    const { feedXml, fileName, maxItemsPerFeed } = req.body || {};

    if (!feedXml || typeof feedXml !== "string" || !feedXml.startsWith("<")) {
      throw new Error("Missing or invalid 'feedXml' string in request body.");
    }

    info("📰 RSS rewrite requested");
    const result = await runRewritePipeline(feedXml, { fileName, maxItemsPerFeed });

    res.status(200).json({ success: true, result });
  } catch (err) {
    error("💥 RSS rewrite failed", { error: err.stack || err.message });
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
