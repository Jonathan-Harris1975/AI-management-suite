// ============================================================
// 🎙 TTS Router — Handles TTS orchestration API endpoints
//  - Returns immediately to avoid request timeouts
//  - Runs the long job detached from the HTTP lifecycle
// ============================================================

import express from "express";
import { info, error } from "#logger.js";
import { orchestrateTTS } from "../index.js";

const router = express.Router();

// Health
router.get("/health", (_req, res) => res.json({ ok: true, service: "tts" }));

/**
 * POST /tts/orchestrate
 * body: { sessionId?: string }
 */
router.post("/orchestrate", async (req, res) => {
  // Never await the full pipeline in this request handler
  const sessionId = req.body?.sessionId || `TT-${Date.now()}`;

  // Defensively ensure we never inherit a slow server timeout
  if (typeof req.setTimeout === "function") {
    req.setTimeout(0); // unlimited for proxies that respect it
  }

  // Respond immediately
  res.json({ ok: true, message: "TTS orchestration started", sessionId });

  // Run the heavy work out-of-band
  (async () => {
    try {
      info({ sessionId }, "🏁 Detached TTS job started");
      await orchestrateTTS(sessionId);
      info({ sessionId }, "🏁 Detached TTS job completed");
    } catch (err) {
      error({ sessionId, error: err?.stack || err?.message }, "💥 Detached TTS job failed");
    }
  })();
});

export default router;
