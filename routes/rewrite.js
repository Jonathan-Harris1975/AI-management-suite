// ============================================================
// 📰 RSS Rewrite Route — AI Podcast Suite
// ============================================================
//
// Purpose:
//   • Exposes /rss/rewrite endpoint
//   • Calls rewriteRSSFeeds() from the RSS Feed Creator pipeline
// ============================================================

import express from "express";
import { rewriteRSSFeeds } from "../services/rss-feed-creator/rewrite-pipeline.js";
import { log } from "../services/shared/utils/logger.js";

const router = express.Router();

// ------------------------------------------------------------
// 🔁 POST /rss/rewrite
// ------------------------------------------------------------
router.post("/rss/rewrite", async (_req, res) => {
  log.info("🔁 RSS rewrite endpoint triggered");

  try {
    const result = await rewriteRSSFeeds();
    res.json({ ok: true, result });
  } catch (err) {
    log.error("❌ RSS rewrite failed", { error: err.message });
    res.status(500).json({ ok: false, error: err.message });
  }
});

export default router;
