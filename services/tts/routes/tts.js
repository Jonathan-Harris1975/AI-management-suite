import logger from "../service-logger.js";
const { info, warn, error, debug } = logger;
// ============================================================
// 🎙 TTS Router — Handles TTS orchestration API endpoints
//  - Returns immediately to avoid request timeouts
//  - Runs the long job detached from the HTTP lifecycle
// ============================================================

import express from "express";
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
      info("🏁 Detached TTS job started", { sessionId });
      await orchestrateTTS(sessionId);
      info("🏁 Detached TTS job completed", { sessionId });
    } catch (err) {
      error("💥 Detached TTS job failed", { sessionId, error: err?.stack || err?.message });
    }
  })();
});

export default router;
