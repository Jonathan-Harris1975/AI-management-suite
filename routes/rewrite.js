import express from "express";
import log from "../utils/root-logger.js";
import { rewriteRSSFeeds } from "../services/rss-feed-creator/rewrite-pipeline.js";

const router = express.Router();

router.post("/rss/rewrite", async (req, res) => {
  const batchSize = Number(req.body?.batchSize) || 5;
  log.info("📰 rss.rewrite.requested", { batchSize });

  try {
    const result = await rewriteRSSFeeds({ batchSize });
    return res.json({ ok: true, ...result });
  } catch (err) {
    log.error("💥 rss.rewrite.failed", { error: err.message });
    return res.status(500).json({ ok: false, error: err.message });
  }
});

export default router;
