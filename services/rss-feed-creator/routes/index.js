// services/rss-feed-creator/routes/index.js
import express from "express";
import rssLogger from "../utils/rss-logger.js";
const log = (...args) => rssLogger.log(...args);

const router = express.Router();

router.get("/", (req, res) => {
  log.info("📰 RSS Feed Creator root route hit");
  res.json({ ok: true, service: "rss-feed-creator" });
});

export default router;
