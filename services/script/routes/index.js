// services/script/routes/index.js
import express from "express";
import { info, error } from "#logger.js";

import {
  generateIntro,
  generateMain,
  generateOutro,
  generateComposedEpisode,
} from "../utils/models.js";

import { orchestrateScript } from "../utils/orchestrator.js";

const router = express.Router();

// health (optional)
router.get("/health", (_req, res) => {
  res.json({ ok: true, service: "script" });
});

// POST /script/intro
router.post("/intro", async (req, res) => {
  try {
    const { date, tone } = req.body || {};
    const text = await generateIntro({ date, tone });
    return res.json({ ok: true, text });
  } catch (err) {
    error("script.route.intro.fail", { err: err.message });
    return res
      .status(500)
      .json({ ok: false, error: err.message });
  }
});

// POST /script/main
router.post("/main", async (req, res) => {
  try {
    const { date, newsItems, tone } = req.body || {};
    const text = await generateMain({ date, newsItems, tone });
    return res.json({ ok: true, text });
  } catch (err) {
    error("script.route.main.fail", { err: err.message });
    return res
      .status(500)
      .json({ ok: false, error: err.message });
  }
});

// POST /script/outro
router.post("/outro", async (req, res) => {
  try {
    const { date, episodeTitle, siteUrl, expectedCta, tone } = req.body || {};
    const text = await generateOutro({
      date,
      episodeTitle,
      siteUrl,
      expectedCta,
      tone,
    });
    return res.json({ ok: true, text });
  } catch (err) {
    error("script.route.outro.fail", { err: err.message });
    return res
      .status(500)
      .json({ ok: false, error: err.message });
  }
});

// POST /script/compose
router.post("/compose", async (req, res) => {
  try {
    const { introText, mainText, outroText, tone } = req.body || {};
    const combo = await generateComposedEpisode({
      introText,
      mainText,
      outroText,
      tone,
    });
    return res.json({ ok: true, ...combo });
  } catch (err) {
    error("script.route.compose.fail", { err: err.message });
    return res
      .status(500)
      .json({ ok: false, error: err.message });
  }
});

// POST /script/orchestrate
router.post("/orchestrate", async (req, res) => {
  try {
    const { episodeId, date, newsItems, tone } = req.body || {};

    const result = await orchestrateEpisode({
      episodeId,
      date,
      newsItems,
      tone,
    });

    return res.json(result);
  } catch (err) {
    error("script.route.orchestrate.fail", { err: err.message });
    return res
      .status(500)
      .json({ ok: false, error: err.message });
  }
});

export default router;
