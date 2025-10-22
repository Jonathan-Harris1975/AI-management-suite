// services/rss-feed-creator/routes/rewrite.js
import express from "express";
import runRewritePipeline from "../rewrite-pipeline.js";
import { info, error } from "#logger.js";

const router = express.Router();

/**
 * POST /rss/rewrite  (mounted from root-level router as /rss/rewrite)
 * Body:
 * {
 *   "feedXml": "<rss>...</rss>",   // REQUIRED: raw RSS/Atom XML as string
 *   "fileName": "optional.xml",    // OPTIONAL: override output filename
 *   "maxItemsPerFeed": 20          // OPTIONAL: cap recent items
 * }
 */
router.post("/rewrite", async (req, res) => {
  try {
    const { feedXml, fileName, maxItemsPerFeed } = req.body || {};

    if (typeof feedXml !== "string" || !feedXml.trim().startsWith("<")) {
      throw new Error("Missing or invalid 'feedXml' string in request body.");
    }

    info("📰 RSS rewrite requested");
    const result = await runRewritePipeline(feedXml, { fileName, maxItemsPerFeed });

    res.status(200).json({ success: true, result });
  } catch (err) {
    error("💥 RSS rewrite failed", { message: err.message, stack: err.stack });
    res.status(500).json({
      success: false,
      error: err.message,
      // Show stack only when not Production to keep prod logs tidy
      stack: process.env.NODE_ENV !== "Production" ? err.stack : undefined,
    });
  }
});

export default router;
