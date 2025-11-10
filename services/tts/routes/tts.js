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

  try {
    const result = await orchestrateTTS(sessionId);
    res.json({ ok: true, sessionId, ...result });
  } catch (err) {
    error({ sessionId, error: err.message }, "💥 /tts/orchestrate failed");
    res.status(500).json({ ok: false, sessionId, error: err.message });
  }
});

export default router;
