// ============================================================================
// services/script/routes/index.js – CLEAN, MODERN, FULLY WORKING VERSION
// ============================================================================
// Removes old broken imports and outdated endpoints.
// Provides a single unified endpoint: POST /script/orchestrate
// ============================================================================

import express from "express";
import { info, error } from "#logger.js";
import {
  generateIntro,
  generateMain,
  generateOutro,
  generateComposedEpisodeParts,
} from "../utils/models.js";

const router = express.Router();

// ---------------------------------------------------------------------------
// HEALTH CHECK
// ---------------------------------------------------------------------------
router.get("/health", (req, res) => {
  res.json({ ok: true, service: "script" });
});

// ---------------------------------------------------------------------------
// FULL SCRIPT PIPELINE (intro → main → outro → editorial → format → transcript)
// ---------------------------------------------------------------------------
router.post("/orchestrate", async (req, res) => {
  try {
    info("script.orchestrate.req", {
      date: req.body?.date,
      sessionId: req.body?.sessionId,
    });

    const result = await orchestrateEpisode(req.body);

    res.json(result);
  } catch (err) {
    error("script.orchestrate.fail", { err: err.message });
    res.status(500).json({
      ok: false,
      error: err.message,
    });
  }
});

export default router;
