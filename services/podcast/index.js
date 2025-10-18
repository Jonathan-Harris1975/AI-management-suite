// services/podcast/index.js
import express from "express";
import { runPodcastPipeline } from "./runPodcastPipeline.js";
import { info } from "#shared/logger.js";

const router = express.Router();

router.post("/run", async (req, res) => {
  const sessionId = req.body.sessionId || `TT-${Date.now()}`;
  info("api.podcast.start", { sessionId });

  // Run asynchronously (fire-and-forget)
  runPodcastPipeline(sessionId)
    .then((r) => info("api.podcast.complete", { sessionId, ok: r.ok }))
    .catch((e) => info("api.podcast.error", { sessionId, error: e.message }));

  // Return quickly to avoid Render timeout
  res.json({
    ok: true,
    sessionId,
    message: "Pipeline started. Logs will record progress.",
  });
});

router.get("/health", (req, res) => {
  res.json({ ok: true, service: "podcast", time: new Date().toISOString() });
});

export default router;
