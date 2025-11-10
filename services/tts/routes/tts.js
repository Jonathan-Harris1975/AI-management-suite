// ============================================================
// 🎙 TTS Router — Handles TTS orchestration API endpoints
// ============================================================

import express from "express";
import { info, error } from "#logger.js";
import { orchestrateTTS } from "../index.js";

const router = express.Router();

// Health check
router.get("/health", (_req, res) => res.json({ ok: true, service: "tts" }));

// 🔊 POST /tts/orchestrate → triggers TTS pipeline (generate + merge + edit + mixdown)
router.post("/orchestrate", async (req, res) => {
  const sessionId = req.body?.sessionId || `TT-${Date.now()}`;
  info({ sessionId }, "🎙 /tts/orchestrate called");

  // Respond immediately to avoid request timeouts; run orchestration async
  res.json({ ok: true, message: "TTS orchestration started", sessionId });

  (async () => {
    try {
      await orchestrateTTS(sessionId);
    } catch (err) {
      error({ sessionId, error: err.message }, "💥 async /tts/orchestrate failed");
    }
  })();
});

export default router;
