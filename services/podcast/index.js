// services/podcast/index.js
import express from "express";
import { runPodcastPipeline } from "./runPodcastPipeline.js";
import { info } from "#logger.js";

const router = express.Router();

router.post("/run", async (req, res) => {
  try {
    // Handle both nested and raw JSON payloads
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const sessionId =
      body?.sessionId ||
      body?.data?.sessionId ||
      `TT-${new Date().toISOString().slice(0, 10)}`;

    info("api.podcast.start", { sessionId });

    if (!sessionId) throw new Error("sessionId is required");

    // Kick off async process
    runPodcastPipeline(sessionId)
      .then(() => info("api.podcast.complete", { sessionId }))
      .catch((err) => info("api.podcast.error", { sessionId, error: err.message }));

    res.json({
      ok: true,
      sessionId,
      message: "Pipeline started. Logs will record progress.",
    });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

router.get("/health", (_req, res) =>
  res.json({ ok: true, service: "podcast", time: new Date().toISOString() })
);

export default router;
