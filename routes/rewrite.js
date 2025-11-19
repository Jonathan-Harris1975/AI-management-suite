// ============================================================
// 📰 RSS Rewrite Route — Manual Trigger
// ============================================================

import express from "express";
import { info, error } from "#logger.js";
import { rewriteRSSFeeds } from "../services/rss-feed-creator/rewrite-pipeline.js";

const router = express.Router();

/**
 * POST /rss/rewrite
 * Body: { batchSize?: number }
 * - Rotates/rewrites active feeds and writes a manifest to R2.
 * - Manual trigger only (not automatic at startup).
 */
router.post("/rss/rewrite", async (req, res) => {
  const batchSize = Number(req.body?.batchSize) || 5;
  info("📰 RSS rewrite requested", { batchSize });

  try {
    const result = await rewriteRSSFeeds({ batchSize });
    return res.json({ ok: true, ...result });
  } catch (err) {
    error("💥 RSS rewrite failed", { error: err.message });
    return res.status(500).json({ ok: false, error: err.message });
  }
});

export default router;
