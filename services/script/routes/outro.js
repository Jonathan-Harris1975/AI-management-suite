// services/script/routes/outro.js
import express from "express";
import { info, error } from "#logger.js";

const router = express.Router();

/**
 * Generates an outro section to close the episode.
 */
export async function generateOutro(sessionId) {
  info(`🧠 Generating outro for ${sessionId}`);
  try {
    const text = `That wraps up another thought-provoking edition of AI Weekly (${sessionId}). Stay curious, stay informed, and join us again for the next journey into the world of artificial intelligence.`;
    return text;
  } catch (err) {
    error("💥 Outro generation failed", { sessionId, error: err.message });
    throw err;
  }
}

// Optional: HTTP route for manual triggering
router.post("/", async (req, res) => {
  const sessionId = req.body?.sessionId || `TT-${Date.now()}`;
  info("📜 Outro requested", { sessionId });
  try {
    const text = await generateOutro(sessionId);
    res.json({ ok: true, sessionId, result: text });
  } catch (err) {
    error("💥 Outro route failed", { sessionId, error: err.message });
    res.status(500).json({ ok: false, sessionId, error: err.message });
  }
});

export default router;
