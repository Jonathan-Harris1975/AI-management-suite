// services/rss-feed-creator/routes/rewrite.js
import express from "express";
import runRewritePipeline from "../rewrite-pipeline.js";
import { info, error } from "#logger.js";

const router = express.Router();

router.post("/rewrite", async (req, res) => {
  try {
    info("📰 RSS rewrite requested");
    const result = await runRewritePipeline(req.body || {});
    res.status(200).json({ success: true, result });
  } catch (err) {
    error("💥 RSS rewrite failed", { error: err.stack || err.message });
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
