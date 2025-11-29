// services/script/routes/index.js

import express from "express";
import { info, error } from "#logger.js";
import {
  generateIntro,
  generateMain,
  generateOutro,
  generateComposedEpisode,
} from "../utils/models.js";
import { orchestrateEpisode } from "../utils/orchestrator.js";

const router = express.Router();

// ─────────────────────────────
//  HEALTH CHECK
// ─────────────────────────────
router.get("/health", (req, res) => {
  res.json({ ok: true, service: "script" });
});

// ─────────────────────────────
//  INTRO
// ─────────────────────────────
router.post("/intro", async (req, res) => {
  try {
    info("script.intro.req", { date: req.body.date });
    const result = await generateIntro(req.body);
    res.json({ ok: true, text: result });
  } catch (err) {
    error("script.intro.fail", { err: err.message });
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─────────────────────────────
//  MAIN
// ─────────────────────────────
router.post("/main", async (req, res) => {
  try {
    info("script.main.req", { date: req.body.date });
    const result = await generateMain(req.body);
    res.json({ ok: true, text: result });
  } catch (err) {
    error("script.main.fail", { err: err.message });
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─────────────────────────────
//  OUTRO
// ─────────────────────────────
router.post("/outro", async (req, res) => {
  try {
    info("script.outro.req", { date: req.body.date });
    const result = await generateOutro(req.body);
    res.json({ ok: true, text: result });
  } catch (err) {
    error("script.outro.fail", { err: err.message });
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─────────────────────────────
//  COMPOSE
// ─────────────────────────────
router.post("/compose", async (req, res) => {
  try {
    info("script.compose.req", { date: req.body.date });
    const result = await generateComposedEpisode(req.body);
    res.json({ ok: true, ...result });
  } catch (err) {
    error("script.compose.fail", { err: err.message });
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─────────────────────────────
//  ORCHESTRATE (FULL PIPELINE)
// ─────────────────────────────
router.post("/orchestrate", async (req, res) => {
  try {
    info("script.orchestrate.req", { date: req.body.date });
    const result = await orchestrateEpisode(req.body);
    res.json(result);
  } catch (err) {
    error("script.orchestrate.fail", { err: err.message });
    res.status(500).json({ ok: false, error: err.message });
  }
});

export default router;
