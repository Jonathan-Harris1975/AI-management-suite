// services/script/routes/index.js
// ============================================================================
// Script service routes – health, direct generators, full orchestrate
// ============================================================================

import express from "express";
import { info, error } from "#logger.js";

import {
  generateIntro,
  generateMain,
  generateOutro,
  generateComposedEpisodeParts,
} from "../utils/models.js";

import { orchestrateEpisode } from "../utils/orchestrator.js";

const router = express.Router();

// ---------------------------------------------------------------------------
// HEALTH CHECK
// ---------------------------------------------------------------------------
router.get("/health", (req, res) => {
  res.json({ ok: true, service: "script" });
});

// ---------------------------------------------------------------------------
// INTRO (direct debug endpoint)
// ---------------------------------------------------------------------------
router.post("/intro", async (req, res) => {
  try {
    const text = await generateIntro(req.body);
    res.json({ ok: true, text });
  } catch (err) {
    error("script.intro.fail", { err: err.message });
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ---------------------------------------------------------------------------
// MAIN (direct debug endpoint)
// ---------------------------------------------------------------------------
router.post("/main", async (req, res) => {
  try {
    const text = await generateMain(req.body);
    res.json({ ok: true, text });
  } catch (err) {
    error("script.main.fail", { err: err.message });
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ---------------------------------------------------------------------------
// OUTRO (direct debug endpoint)
// ---------------------------------------------------------------------------
router.post("/outro", async (req, res) => {
  try {
    const text = await generateOutro(req.body);
    res.json({ ok: true, text });
  } catch (err) {
    error("script.outro.fail", { err: err.message });
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ---------------------------------------------------------------------------
/* COMPOSE (intro + main + outro, no transcript write) */
// ---------------------------------------------------------------------------
router.post("/compose", async (req, res) => {
  try {
    const result = await generateComposedEpisodeParts(req.body);
    res.json({ ok: true, ...result });
  } catch (err) {
    error("script.compose.fail", { err: err.message });
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ---------------------------------------------------------------------------
// FULL PIPELINE (this is what runPodcastPipeline calls)
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
    res.status(500).json({ ok: false, error: err.message });
  }
});

export default router;
