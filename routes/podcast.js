import express from "express";
import { runPodcastPipeline } from "../services/podcast/runPodcastPipeline.js";
import { info, error } from "#logger.js";

const router = express.Router();

router.get("/", (_req, res) => {
  info("🎧 Podcast route health OK");
  res.json({ ok: true, service: "podcast", message: "Ready to trigger pipeline" });
});

router.post("/", async (req, res) => {
  const sessionId = req.body?.sessionId || `TT-${Date.now()}`;
  try {
    info("🎙️ Starting podcast pipeline", { sessionId });
    await runPodcastPipeline(sessionId);
    res.status(202).json({ ok: true, sessionId });
  } catch (err) {
    error("💥 Podcast pipeline failed", { error: err.stack });
    res.status(500).json({ ok: false, error: err.message });
  }
});

export default router;
