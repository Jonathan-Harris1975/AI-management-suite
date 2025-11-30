// services/script/routes/index.js
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

// Health
router.get("/health", (req, res) => {
  res.json({ ok: true, service: "script" });
});

// FULL EPISODE
router.post("/orchestrate", async (req, res) => {
  try {
    info("script.orchestrate.req", {
      date: req.body?.date,
      sessionId: req.body?.sessionId,
    });

    const result = await orchestrateEpisode(req.body);  // <-- THIS WAS MISSING
    res.json(result);

  } catch (err) {
    error("script.orchestrate.fail", { err: err.message });
    res.status(500).json({ ok: false, error: err.message });
  }
});

export default router;
