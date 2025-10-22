// services/script/routes/script.js
import { Router } from "express";
import { info, error } from "#shared/logger.js";
import { runScriptPipeline } from "../index.js";

const router = Router();

/**
 * POST /script/orchestrate
 * Example payload:
 * {
 *   "episodeId": "2025-10-22",
 *   "topic": "AI in Modern Journalism",
 *   "rawText": "Recent trends in generative AI...",
 *   "tone": { "style": "gen-x" }
 * }
 */
router.post("/orchestrate", async (req, res) => {
  try {
    const { episodeId, topic, rawText, tone } = req.body || {};
    if (!episodeId || !topic) {
      return res.status(400).json({
        status: "error",
        error: "Missing required fields: episodeId and topic",
      });
    }

    info("🎬 Script orchestrate request received", { episodeId, topic });

    const result = await runScriptPipeline({ episodeId, topic, rawText, tone });

    return res.status(200).json({
      status: "success",
      message: "Podcast script pipeline completed successfully.",
      data: result,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    error("❌ Script orchestration failed", { err: err.message });
    return res.status(500).json({
      status: "error",
      error: err.message || "Internal Server Error",
      timestamp: new Date().toISOString(),
    });
  }
});

export default router;
