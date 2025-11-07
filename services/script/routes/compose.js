// services/script/routes/compose.js

import express from "express";
import { info, error } from "#logger.js";

const router = express.Router();

/**
 * Combine intro, main, and outro sections into a single composed text.
 * Exported as both an Express route and a callable utility.
 */
export async function composeEpisode({ intro, main, outro, sessionId, tone = "neutral" }) {
  try {
    const fullText = [intro, main, outro].filter(Boolean).join("\n\n");
    info(`🧠 Composed episode text for ${sessionId}`);
    return { fullText, sessionId, tone };
  } catch (err) {
    error("💥 Compose episode failed", { sessionId, error: err.message });
    throw err;
  }
}

// Express POST route (optional external API)
router.post("/compose", async (req, res) => {
  const { intro, main, outro, sessionId, tone = "neutral" } = req.body;

  try {
    const result = await composeEpisode({ intro, main, outro, sessionId, tone });
    res.status(200).json({ ok: true, result });
  } catch (err) {
    error("💥 Compose API failed", { sessionId, error: err.message });
    res.status(500).json({ ok: false, error: err.message });
  }
});

export default router;
