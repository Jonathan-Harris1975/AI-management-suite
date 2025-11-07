// services/script/routes/main.js
import express from "express";
import { info, error } from "#logger.js";

const router = express.Router();

/**
 * Generates the main discussion or core content for the episode.
 */
export async function generateMain(sessionId) {
  info(`🧠 Generating main section for ${sessionId}`);
  try {
    const text = `In today's episode (${sessionId}), we dive deep into the latest breakthroughs in AI — from multimodal reasoning to sustainable model design — exploring what it means for the future of technology and society.`;
    return text;
  } catch (err) {
    error("💥 Main section generation failed", { sessionId, error: err.message });
    throw err;
  }
}

// Optional: HTTP route for manual triggering
router.post("/", async (req, res) => {
  const sessionId = req.body?.sessionId || `TT-${Date.now()}`;
  info("📜 Main section requested", { sessionId });
  try {
    const text = await generateMain(sessionId);
    res.json({ ok: true, sessionId, result: text });
  } catch (err) {
    error("💥 Main route failed", { sessionId, error: err.message });
    res.status(500).json({ ok: false, sessionId, error: err.message });
  }
});

export default router;
