import { Router } from "express";
import { endToEndRewrite } from "../rewrite-pipeline.js";

const router = Router();

/**
 * POST /rewrite
 *
 * Triggers:
 *  - fetch RSS sources
 *  - rewrite with AI (OpenRouter via resilientRequest)
 *  - shorten URLs
 *  - generate RSS XML
 *  - upload to R2
 *
 * Returns summary metadata. Does NOT require sessionId.
 */
router.post("/rewrite", async (req, res) => {
  try {
    const result = await endToEndRewrite();

    return res.status(200).json({
      ok: true,
      message: "Feed fetched, rewritten, and published to R2.",
      meta: {
        itemsProcessed: result.itemsProcessed,
        r2: result.r2Result,
      },
    });
  } catch (err) {
    console.error("rewrite.route.error", err);
    return res.status(500).json({
      ok: false,
      error: "Failed to generate rewritten RSS feed",
      details: err?.message || String(err),
    });
  }
});

export default router;
