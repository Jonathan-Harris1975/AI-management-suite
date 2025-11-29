// services/podcast/routes/podcast.js
// ============================================================
// THIS FILE NOW USES THE NEW FULL PIPELINE
// Old runPodcastPipeline() has been removed.
// All /podcast calls now run the correct pipeline.
// ============================================================

import express from "express";
import pipelineRouter from "./podcast-pipeline.js";

const router = express.Router();

// Forward ALL /podcast requests to the new pipeline implementation
router.use("/", pipelineRouter);

export default router;
