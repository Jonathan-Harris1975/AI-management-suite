import express from "express";
import { rewriteRssFeed } from "../rewrite-pipeline.js"; // ✅ Fixed import
import { info, error } from "../../shared/utils/logger.js";

const router = express.Router();

router.post("/rewrite", async (req, res) => {
  try {
    info("📰 RSS rewrite requested", { batchSize: req.body.batchSize });
    const { feedContent, options } = req.body;

    if (!feedContent) {
      return res.status(400).json({ success: false, error: "Missing feedContent" });
    }

    const result = await rewriteRssFeed(feedContent, options);
    return res.status(200).json({ success: true, result });
  } catch (err) {
    error("💥 RSS Rewrite route failed", { error: err.message });
    return res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
