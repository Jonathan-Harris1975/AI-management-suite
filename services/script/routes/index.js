// ============================================================================
// services/script/routes/index.js – CLEAN ORCHESTRATE-ONLY ROUTER
// ============================================================================

import express from "express";
import { info, error } from "#logger.js";
import { orchestrateEpisode } from "../utils/orchestrator.js";

const router = express.Router();

// ---------------------------------------------------------------------------
// HEALTH CHECK
// ---------------------------------------------------------------------------
router.get("/health", (req, res) => {
  res.json({ ok: true, service: "script" });
});

// ---------------------------------------------------------------------------
// FULL SCRIPT PIPELINE (intro → main → outro → editorial → format → chunk)
// ---------------------------------------------------------------------------
router.post("/orchestrate", async (req, res) => {
  const { sessionId, date, topic, tone } = req.body || {};

  try {
    info("script.orchestrate.req", {
      sessionId,
      date,
    });

    const result = await orchestrateEpisode({
      sessionId,
      date,
      topic,
      tone,
    });

    res.json({
      ok: true,
      ...result,
    });
  } catch (err) {
    error("script.orchestrate.fail", {
      sessionId,
      error: err.message,
    });

    res.status(500).json({
      ok: false,
      error: err.message,
    });
  }
});

export default router;
