// ============================================================
// 🔊 TTS Route — Entry Point for Full Pipeline
// ============================================================

import express from "express";
import { orchestrateTTS } from "../utils/orchestrator.js";
import { info, error } from "#logger.js";

const router = express.Router();

router.post("/", async (req, res) => {
  const { sessionId } = req.body;
  info({ sessionId }, "🔊 /tts orchestrate route called");

  try {
    const result = await orchestrateTTS(sessionId);
    res.json({ success: true, result });
  } catch (err) {
    error({ sessionId, error: err.message }, "💥 /tts orchestration failed");
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
