// services/script/routes/intro.js
import express from "express";
import { info, error } from "#logger.js";

const router = express.Router();

/**
 * Generates an AI-powered introduction section for the episode.
 * Can be used directly (via import) or as an Express route.
 */
export async function generateIntro(sessionId) {
  info(`🧠 Generating intro for ${sessionId}`);
  try {
    // Core logic (can be replaced with your real AI call)
    const text = `Welcome to another AI Weekly episode. In this session (${sessionId}), we explore the latest in AI innovation and its impact across industries.`;
    return text;
  } catch (err) {
    error("💥 Intro generation failed", { sessionId, error: err.message });
    throw err;
  }
}

// Optional: Express route to call intro via HTTP
router.post("/", async (req, res) => {
  const sessionId = req.body?.sessionId || `TT-${Date.now()}`;
  info("📜 Intro requested", { sessionId });
  try {
    const text = await generateIntro(sessionId);
    res.json({ ok: true, sessionId, result: text });
  } catch (err) {
    error("💥 Intro route failed", { sessionId, error: err.message });
    res.status(500).json({ ok: false, sessionId, error: err.message });
  }
});

export default router;
