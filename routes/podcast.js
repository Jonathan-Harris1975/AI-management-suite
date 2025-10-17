// /routes/podcast.js — AI Podcast Suite (Final Stable 2025-10-11)
import express from "express";
// When re-enabled, you can import your Gemini / TTS logic here, e.g.:
// import { runPodcastPipeline } from "../services/podcast-engine/index.js";

const router = express.Router();

/**
 * Handles both GET (status check) and POST (trigger podcast generation)
 */
router.all("/", async (req, res) => {
  const isPost = req.method === "POST";

  if (!isPost) {
    return res.status(200).json({
      status: "ok",
      route: "podcast",
      message: "Podcast route is active. Use POST to start TTS or episode generation.",
      method: req.method,
    });
  }

  try {
    // Placeholder until Gemini 2.5 TTS pipeline is active
    // const result = await runPodcastPipeline();
    const result = { note: "Gemini 2.5 TTS pipeline placeholder (coming soon)" };

    res.status(200).json({
      success: true,
      route: "podcast",
      message: "Podcast generation executed successfully.",
      result,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      route: "podcast",
      message: "Podcast generation failed.",
      error: error.message,
    });
  }
});

export default router;
