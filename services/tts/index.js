// services/tts/index.js
import express from "express";
import { info, error } from "#logger.js";
import { orchestrateTTS } from "./utils/orchestrator.js";

const router = express.Router();

// Health
router.get("/health", (_req, res) => res.json({ ok: true, service: "tts" }));

// One-shot orchestration (generate MP3 chunks → merge → upload merged)
router.post("/orchestrate", async (req, res) => {
  const sessionId = req.body?.sessionId || `TT-${Date.now()}`;
  info({ sessionId }, "🎙 /tts/orchestrate called");
  try {
    const out = await orchestrateTTS(sessionId);
    res.json({ ok: true, sessionId, ...out });
  } catch (e) {
    error({ sessionId, err: e.message }, "💥 /tts/orchestrate failed");
    res.status(500).json({ ok: false, sessionId, error: e.message });
  }
});

export default router;
export { orchestrateTTS };
