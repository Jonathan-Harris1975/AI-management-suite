// ============================================================
// 🧠 AI Podcast Suite — RSS Feed Rewrite Endpoint
// ============================================================
//
// Simple trigger for the RSS rewrite service.
// You can call it from Make.com (HTTP POST /rss/rewrite)
// ============================================================

import express from "express";
import { info, error } from "#shared/logger.js";
import { runRSSRewrite } from "../services/rss/runRSSRewrite.js"; // adjust if filename differs

const router = express.Router();

router.post("/rss/rewrite", async (req, res) => {
  try {
    const result = await runRSSRewrite(req.body || {});
    info("📰 RSS rewrite triggered", { ok: true });
    res.json({ ok: true, result });
  } catch (err) {
    error("💥 RSS rewrite failed", { error: err.message });
    res.status(500).json({ ok: false, error: err.message });
  }
});

export default router;
