// routes/index.js
import express from "express";
import { info, error } from "#logger.js";

// ─────────────────────────────
//  SERVICE ROUTES
// ─────────────────────────────
import rssRoutes from "../services/rss-feed-creator/routes/rewrite.js";
import scriptRoutes from "../services/script/routes/index.js";
import ttsRoutes from "../services/tts/index.js";
import artworkRoutes from "../services/artwork/index.js";   // ✅ FIXED import
import podcastRoutes from "./podcast.js";
import podcastPipelineRoutes from "./podcast-pipeline.js";

const router = express.Router();

info("🚀 Starting route registration...");

try {
  // ─────────────────────────────
  //  HEALTH ENDPOINTS
  // ─────────────────────────────
  router.get("/api/rss/health", (_req, res) =>
    res.status(200).json({ status: "ok", service: "rss-feed-creator" })
  );

  router.get("/api/podcast/health", (_req, res) =>
    res.status(200).json({ status: "ok", service: "podcast" })
  );

  // ─────────────────────────────
  //  RSS FEED CREATOR
  // ─────────────────────────────
  // POST /rss/rewrite
  router.use("/rss", rssRoutes);
  info("📰 Mounted: /rss");

  // ─────────────────────────────
  //  SCRIPT GENERATION & ORCHESTRATION
  // ─────────────────────────────
  // POST /script/(intro|main|outro|compose|orchestrate)
  router.use("/script", scriptRoutes);
  info("✍️ Mounted: /script");

  // ─────────────────────────────
  //  TTS SERVICE
  // ─────────────────────────────
  // POST /tts/generate
  router.use("/tts", ttsRoutes);
  info("🔊 Mounted: /tts");

  // ─────────────────────────────
  //  ARTWORK CREATION
  // ─────────────────────────────
  // POST /artwork/(create|generate)
  router.use("/artwork", artworkRoutes); // ✅ FIXED mount
  info("🎨 Mounted: /artwork");

  // ─────────────────────────────
  //  PODCAST GENERATION
  // ─────────────────────────────
  router.use("/podcast", podcastRoutes);
  info("🎧 Mounted: /podcast");

  // ─────────────────────────────
  //  PODCAST PIPELINE
  // ─────────────────────────────
  router.use("/podcast/pipeline", podcastPipelineRoutes);
  info("🧵 Mounted: /podcast/pipeline");

  info("✅ All routes mounted successfully.");
} catch (err) {
  error("💥 Failed during route registration", { error: err.stack });
}

export default router;
