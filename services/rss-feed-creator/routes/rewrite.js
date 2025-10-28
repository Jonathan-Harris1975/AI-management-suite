import { Router } from "express";
import { endToEndRewrite } from "../rewrite-pipeline.js";

const router = Router();

/**
 * POST /rewrite
 * Rewrites/summarises latest AI/tech news feeds and saves to R2.
 * No sessionId required.
 */
router.post("/rewrite", async (req, res) => {
  try {
    const result = await endToEndRewrite();

    return res.status(200).json({
      ok: true,
      message: "RSS content ingested, rewritten, and saved.",
      meta: {
        itemsProcessed: result.count,
        r2: result.r2Result,
      },
    });
  } catch (err) {
    console.error("rewrite.route.error", err);
    return res.status(500).json({
      ok: false,
      error: "Failed to rewrite and persist RSS content",
      details: err?.message || String(err),
    });
  }
});

export default router;
