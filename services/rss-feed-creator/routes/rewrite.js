// services/rss-feed-creator/routes/rewrite.js

import express from "express";
import { rewriteFeedItems } from "../utils/rewriteFeedItems.js";
import { getObjectAsJson } from "../../shared/utils/r2-client.js";

const router = express.Router();

router.post("/rss-rewrite", async (req, res) => {
  const { sessionId } = req.body;

  if (!sessionId) {
    console.warn("⚠️ Missing sessionId in request body.");
    return res.status(400).json({ error: "Missing sessionId." });
  }

  try {
    console.log("🔍 Loading feed data from R2 for session:", sessionId);

    const key = `rss/${sessionId}.json`;
    const rawFeed = await getObjectAsJson(key);

    if (!rawFeed || !rawFeed.articles) {
      console.warn("🚫 No articles found in R2 under key:", key);
      return res.status(404).json({ error: "No feed data found for this session." });
    }

    console.log(`🧩 Rewriting ${rawFeed.articles.length} feed items via AI model...`);

    const rewrittenItems = await rewriteFeedItems(rawFeed.articles, sessionId);

    return res.json({
      status: "success",
      count: rewrittenItems.length,
      articles: rewrittenItems
    });
  } catch (error) {
    console.error("❌ Error in rss-rewrite route:", error);
    return res.status(500).json({ error: "Failed to rewrite RSS feed items." });
  }
});

export { router as rssRewrite };
