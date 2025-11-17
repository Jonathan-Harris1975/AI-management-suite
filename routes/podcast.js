import express from "express";
import { runPodcastPipeline } from "../services/podcast/runPodcastPipeline.js";
import log from "../utils/root-logger.js";

const router = express.Router();

router.get("/", (_req, res) => {
  log.info("🎧 podcast.route.health");
  res.json({ ok: true, service: "podcast", message: "Ready to trigger pipeline" });
});

router.post("/", async (req, res) => {
  const sessionId = req.body?.sessionId || `TT-${Date.now()}`;
  try {
    log.info("🎙️ podcast.pipeline.start", { sessionId });
    await runPodcastPipeline(sessionId);
    res.status(202).json({ ok: true, sessionId });
  } catch (err) {
    log.error("💥 podcast.pipeline.failed", { error: err.stack });
    res.status(500).json({ ok: false, error: err.message });
  }
});

export default router;
