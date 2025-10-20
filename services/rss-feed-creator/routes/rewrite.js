// ✅ inside rewrite.js
import express from "express";
import { info, error } from "../shared/utils/logger.js";
import { rewriteRSSFeeds } from "../rewrite-pipeline.js";

const router = express.Router();

router.post("/rewrite", async (req, res) => {
  try {
    info("📰 RSS rewrite requested");
    const result = await rewriteRSSFeeds(req.body);
    res.status(200).json({ success: true, result });
  } catch (err) {
    error("💥 RSS rewrite failed", { error: err.message });
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
