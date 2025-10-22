// routes/index.js
import express from "express";
import { info, error } from "#logger.js";

// ===============================
// IMPORT SERVICE ROUTERS
// ===============================
import rssRoutes from "../services/rss-feed-creator/routes/rewrite.js";
import scriptRoutes from "../services/script/routes/index.js";
import orchestrateRoutes from "./script-orchestrate.js"; // ✅ NEW
import ttsRoutes from "../services/tts/routes/tts.js";
import artworkRoutes from "../services/artwork/routes/createArtwork.js";
import podcastRoutes from "./podcast.js";
import podcastPipelineRoutes from "./podcast-pipeline.js";

const router = express.Router();

info("🚀 Starting route registration...");

try {
  // --- RSS FEED CREATOR ---
  router.get("/api/rss/health", (_req, res) =>
    res.status(200).json({ status: "ok", service: "rss-feed-creator" })
  );
  router.use("/rss", rssRoutes);
  info("📰 Mounted: /rss/rewrite");

  // --- SCRIPT GENERATION (main logic) ---
  router.use("/script", scriptRoutes);
  info("✍️ Mounted: /script");

  // --- SCRIPT ORCHESTRATOR (runs intro → main → outro → compose) ---
  router.use("/", orchestrateRoutes); // ✅ Ensures /script/orchestrate is active
  info("🎬 Mounted: /script/orchestrate");

  // --- TTS SERVICE ---
  router.use("/tts", ttsRoutes);
  info("🗣️ Mounted: /tts");

  // --- ARTWORK CREATION ---
  router.use("/artwork", artworkRoutes);
  info("🎨 Mounted: /artwork");

  // --- PODCAST GENERATION ---
  router.use("/podcast", podcastRoutes);
  info("🎧 Mounted: /podcast");

  // --- PODCAST PIPELINE ---
  router.use("/podcast/pipeline", podcastPipelineRoutes);
  info("🧩 Mounted: /podcast/pipeline");

  info("✅ All routes mounted successfully.");
} catch (err) {
  error("💥 Failed during route registration", { error: err.stack });
}

export default router;
