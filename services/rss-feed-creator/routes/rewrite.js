/**
 * rewrite.js
 * Handles POST /rss/rewrite — fetches, rewrites, and regenerates the RSS feed.
 * Returns 200 with a short JSON payload; detailed progress is logged centrally.
 */

import express from "express";
import { endToEndRewrite } from "../rewrite-pipeline.js";
import rssLogger from "../utils/rss-logger.js";

const router = express.Router();

router.post("/rewrite", async (req, res) => {
  const runIdFromBody = req.body?.runId;
  const runId = rssLogger.startRun(runIdFromBody);

// SILENT   rssLogger.info(`RSS rewrite route triggered (runId: ${runId}).`);
  rssLogger.stageStart("pipeline", "Running RSS end-to-end rewrite pipeline.");

  try {
    const result = await endToEndRewrite();
    rssLogger.stageEnd("pipeline", "RSS rewrite pipeline finished.");

    const extra = {};
    if (result && typeof result === "object") {
      if ("totalItems" in result) extra.totalItems = result.totalItems;
      if ("rewrittenItems" in result) extra.rewrittenItems = result.rewrittenItems;
    }
    rssLogger.endRun(extra);

    res.status(200).json({
      status: "ok",
      route: "rss/rewrite",
      runId,
      message: "RSS rewrite process completed. Logs will show the full pipeline progress.",
      result,
    });
  } catch (err) {
    rssLogger.runError(err);
    res.status(500).json({
      status: "error",
      route: "rss/rewrite",
      runId,
      message: "RSS rewrite process failed. Check logs for details.",
      error: err?.message || String(err),
    });
  }
});

// ✅ Default export for Express loader compatibility
export default router;