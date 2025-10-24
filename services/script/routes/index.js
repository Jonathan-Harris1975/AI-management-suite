// services/script/routes/index.js
// Exposes the podcast script generation endpoints:
//   POST /script/intro
//   POST /script/main
//   POST /script/outro
//   POST /script/compose
//   POST /script/orchestrate

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

/**
 * POST /script/intro
 * body: { topic, date, tone? }
 */
router.post("/intro", async (req, res) => {
  const { topic, date, tone = {} } = req.body || {};
  info("script.intro.req", { topic, date });

  try {
    const text = await generateIntro({ topic, date, tone });
    return res.status(200).json({ ok: true, text });
  } catch (err) {
    error("script.intro.fail", { err: err.message });
    return res.status(500).json({ ok: false, error: err.message });
  }
});

/**
 * POST /script/main
 * body: { topic, talkingPoints[], tone? }
 */
router.post("/main", async (req, res) => {
  const { topic, talkingPoints = [], tone = {} } = req.body || {};
  info("script.main.req", { topic, talkingPointsCount: talkingPoints.length });

  try {
    const text = await generateMain({ topic, talkingPoints, tone });
    return res.status(200).json({ ok: true, text });
  } catch (err) {
    error("script.main.fail", { err: err.message });
    return res.status(500).json({ ok: false, error: err.message });
  }
});

/**
 * POST /script/outro
 * body: { topic, tone? }
 */
router.post("/outro", async (req, res) => {
  const { topic, tone = {} } = req.body || {};
  info("script.outro.req", { topic });

  try {
    const text = await generateOutro({ topic, tone });
    return res.status(200).json({ ok: true, text });
  } catch (err) {
    error("script.outro.fail", { err: err.message });
    return res.status(500).json({ ok: false, error: err.message });
  }
});

/**
 * POST /script/compose
 * body: { introText, mainText, outroText, tone? }
 * returns the stitched final script (host-ready)
 */
router.post("/compose", async (req, res) => {
  const { introText = "", mainText = "", outroText = "", tone = {} } = req.body || {};
  info("script.compose.req", {
    introLen: introText.length,
    mainLen: mainText.length,
    outroLen: outroText.length,
  });

  try {
    const text = await generateComposedEpisode({
      introText,
      mainText,
      outroText,
      tone,
    });

    return res.status(200).json({ ok: true, text });
  } catch (err) {
    error("script.compose.fail", { err: err.message });
    return res.status(500).json({ ok: false, error: err.message });
  }
});

/**
 * POST /script/orchestrate
 * body: { sessionId, topic?, date?, tone? }
 *
 * This calls intro → main → outro → compose in-process
 * using the orchestrator. The orchestrator is responsible
 * for any temp caching and assembly logic.
 */
router.post("/orchestrate", async (req, res) => {
  const { sessionId, topic, date, tone = {} } = req.body || {};
  info("script.orchestrate.req", { sessionId, topic, date });

  try {
    const result = await orchestrateScript({
      sessionId,
      topic,
      date,
      tone,
    });

    // result is expected to include { ok, finalScript, chunks?, meta? }
    return res.status(200).json({ ok: true, ...result });
  } catch (err) {
    error("script.orchestrate.fail", { sessionId, err: err.message });
    return res.status(500).json({ ok: false, error: err.message });
  }
});

export default router;
