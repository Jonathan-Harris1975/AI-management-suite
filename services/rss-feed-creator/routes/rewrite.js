import express from "express";
import { info, error, warn } from "#logger.js";
import { getText, putText } from "#shared/r2-client.js";
import { runRewritePipeline } from "../rewrite-pipeline.js";
import { fetchWithTimeout } from "import { fetchWithTimeout } from "../../../shared/http-client.js";"; // your existing HTTP util
import { ensureR2Sources, rotateFeeds } from "../utils/rss-bootstrap.js";

const router = express.Router();

/**
 * 🧠 RSS Rewrite API
 * POST /rss/rewrite
 */
router.post("/rewrite", async (req, res) => {
  try {
    info("📰 RSS rewrite requested");

    let feedXml = req.body.feedXml;
    if (!feedXml) {
      info("⚙️ No feedXml provided — fetching next RSS feed from R2 rotation...");

      const { feeds, rotation } = await ensureR2Sources();
      const { feeds: selected } = await rotateFeeds({
        feeds,
        rotation,
        maxFeeds: 1,
      });

      if (!selected.length) {
        throw new Error("No feeds found in rotation.");
      }

      const nextFeedUrl = selected[0];
      info(`📡 Using feed: ${nextFeedUrl}`);

      // 1️⃣ Download feed with HTTP validation
      const resp = await fetchWithTimeout(nextFeedUrl, { timeout: 15000 });
      if (!resp.ok) throw new Error(`Failed to download ${nextFeedUrl}: HTTP ${resp.status}`);

      const contentType = resp.headers.get("content-type") || "";
      const text = await resp.text();

      // 2️⃣ Validate XML vs HTML or wrong mime
      if (
        !contentType.includes("xml") &&
        !text.trim().startsWith("<") &&
        /<!DOCTYPE html>|<html/i.test(text)
      ) {
        warn(`⚠️ Skipping feed — non-XML content from ${nextFeedUrl}`);
        return res.status(204).json({
          skipped: true,
          reason: "Non-XML response (likely HTML or 404)",
          feed: nextFeedUrl,
        });
      }

      feedXml = text;
    }

    // 3️⃣ Run rewrite
    const result = await runRewritePipeline(feedXml);
    if (!result.key) {
      warn("⚠️ No rewritten output generated — nothing uploaded.");
      return res.status(204).json({ skipped: true });
    }

    res.json({
      success: true,
      count: result.count,
      publicUrl: result.publicUrl,
    });
  } catch (err) {
    error("💥 RSS rewrite failed", { message: err.message, stack: err.stack });
    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});

export default router;
