import log from ;
// ============================================================
// 📰 RSS Rewrite Route — Manual Trigger
// ============================================================

import express from ;
import { info, error } from ;
import { rewriteRSSFeeds } from ;

const router = express.Router();

/**
 * POST /rss/rewrite
 * Body: { batchSize?: number }
 * - Rotates/rewrites active feeds and writes a manifest to R2.
 * - Manual trigger only (not automatic at startup).
 */
router.post(, async (req, res) => {
  const batchSize = Number(req.body?.batchSize) || 5;
  info(, { batchSize });

  try {
    const result = await rewriteRSSFeeds({ batchSize });
    return res.json({ ok: true, ...result });
  } catch (err) {
    error(, { error: err.message });
    return res.status(500).json({ ok: false, error: err.message });
  }
});

export default router;
