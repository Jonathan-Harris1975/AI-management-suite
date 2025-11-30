// ============================================================================
// services/script/routes/index.js
// ----------------------------------------------------------------------------
// Public HTTP routes for the script service.
// - /script/health
// - /script/intro
// - /script/main
// - /script/outro
// - /script/orchestrate  (full episode script pipeline)
// ============================================================================

import express from "express";
import { info, error } from "#logger.js";
import { orchestrateEpisode } from "../utils/orchestrator.js";
import {
  generateIntro,
  generateMain,
  generateOutro,
} from "../utils/models.js";

const router = express.Router();

// ---------------------------------------------------------------------------
// HEALTH CHECK
// ---------------------------------------------------------------------------
router.get("/health", (req, res) => {
  res.json({ ok: true, service: "script" });
});

// ---------------------------------------------------------------------------
// INTRO ONLY
// ---------------------------------------------------------------------------
router.post("/intro", async (req, res) => {
  try {
    const ctx = req.body || {};
    info("script.intro.req", { date: ctx.date, sessionId: ctx.sessionId });

    const text = await generateIntro(ctx);
    res.json({ ok: true, text });
  } catch (err) {
    error("script.intro.fail", { error: String(err) });
    res.status(500).json({ ok: false, error: String(err) });
  }
});

// ---------------------------------------------------------------------------
// MAIN ONLY
// ---------------------------------------------------------------------------
router.post("/main", async (req, res) => {
  try {
    const ctx = req.body || {};
    info("script.main.req", { date: ctx.date, sessionId: ctx.sessionId });

    const text = await generateMain(ctx);
    res.json({ ok: true, text });
  } catch (err) {
    error("script.main.fail", { error: String(err) });
    res.status(500).json({ ok: false, error: String(err) });
  }
});

// ---------------------------------------------------------------------------
// OUTRO ONLY
// ---------------------------------------------------------------------------
router.post("/outro", async (req, res) => {
  try {
    const ctx = req.body || {};
    info("script.outro.req", { date: ctx.date, sessionId: ctx.sessionId });

    const text = await generateOutro(ctx);
    res.json({ ok: true, text });
  } catch (err) {
    error("script.outro.fail", { error: String(err) });
    res.status(500).json({ ok: false, error: String(err) });
  }
});

// ---------------------------------------------------------------------------
// FULL ORCHESTRATION (INTRO → MAIN → OUTRO → EDITORIAL → CHUNKS)
// ---------------------------------------------------------------------------
router.post("/orchestrate", async (req, res) => {
  try {
    const ctx = req.body || {};
    info("script.orchestrate.req", {
      date: ctx.date,
      sessionId: ctx.sessionId,
    });

    const result = await orchestrateEpisode(ctx);
    res.json(result);
  } catch (err) {
    error("script.orchestrate.fail", { error: String(err) });
    res.status(500).json({ ok: false, error: String(err) });
  }
});

export default router;
