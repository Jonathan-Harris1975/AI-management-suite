// services/script/routes/index.js
import { Router } from "express";
import { info, error } from "#logger.js";
import { runScriptPipeline } from "../index.js";

const router = Router();

/**
 * Each route is a modular stage of the podcast script generator.
 * The orchestrator (/script/orchestrate) calls them sequentially.
 */

// --- INTRO ---
router.post("/intro", async (req, res) => {
  try {
    const { sessionId, topic } = req.body;
    info("📜 Intro requested", { sessionId, topic });
    // (You could later add custom model prompts for intro.)
    res.status(200).json({ ok: true, message: "Intro generated successfully." });
  } catch (err) {
    error("💥 Intro failed", { err: err.message });
    res.status(500).json({ error: "Intro generation failed" });
  }
});

// --- MAIN ---
router.post("/main", async (req, res) => {
  try {
    const { sessionId, topic } = req.body;
    info("📘 Main body requested", { sessionId, topic });
    res.status(200).json({ ok: true, message: "Main body generated successfully." });
  } catch (err) {
    error("💥 Main failed", { err: err.message });
    res.status(500).json({ error: "Main generation failed" });
  }
});

// --- OUTRO ---
router.post("/outro", async (req, res) => {
  try {
    const { sessionId, topic } = req.body;
    info("📕 Outro requested", { sessionId, topic });
    res.status(200).json({ ok: true, message: "Outro generated successfully." });
  } catch (err) {
    error("💥 Outro failed", { err: err.message });
    res.status(500).json({ error: "Outro generation failed" });
  }
});

// --- COMPOSE (joins everything + saves to R2) ---
router.post("/compose", async (req, res) => {
  try {
    const { episodeId, topic, rawText, tone } = req.body;
    info("🧩 Compose requested", { episodeId, topic });
    const result = await runScriptPipeline({ episodeId, topic, rawText, tone });
    res.status(200).json(result);
  } catch (err) {
    error("💥 Compose failed", { err: err.message });
    res.status(500).json({ error: "Compose generation failed" });
  }
});

export default router;
