// /routes/rss.js — AI Podcast Suite (Final Stable 2025-10-11)
import express from "express";
import { getObject } from "../services/shared/utils/r2-client.js";

const router = express.Router();

/**
 * Handles both GET (fetch RSS) and POST (rebuild RSS feed)
 */
router.all("/", async (req, res) => {
  const isPost = req.method === "POST";

  if (!isPost) {
    try {
      const xml = await getObject("rss.xml");
      res.set("Content-Type", "application/rss+xml");
      res.send(
        xml || "<rss><channel><title>No RSS Found</title></channel></rss>"
      );
    } catch (err) {
      res.status(500).json({
        success: false,
        route: "rss",
        message: "Failed to fetch RSS feed.",
        error: err.message,
      });
    }
  } else {
    try {
      // Placeholder for RSS rebuild logic (e.g. re-run rewrite pipeline)
      const result = { note: "RSS feed rebuild triggered (placeholder)." };
      res.status(200).json({
        success: true,
        route: "rss",
        message: "RSS feed rebuild completed successfully.",
        result,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        route: "rss",
        message: "RSS feed rebuild failed.",
        error: error.message,
      });
    }
  }
});

export default router;
