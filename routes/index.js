// routes/index.js
import express from "express";
import { info, error } from "#logger.js";

// ===============================
// IMPORT SERVICE ROUTERS
// ===============================
import rssRoutes from "../services/rss-feed-creator/routes/rewrite.js";
import scriptRoutes from "../services/script/routes/index.js";
import ttsRoutes from "../services/tts/routes/tts.js";
import artworkRoutes from "../services/artwork/routes/createArtwork.js";

// ✅ FIXED IMPORTS — use existing top-level route files
import podcastRoutes from "./podcast.js";
import podcastPipelineRoutes from "./podcast-pipeline.js";

const router = express.Router();

// ===============================
// ROUTE REGISTRATION
// ===============================
info("🚀 Starting route registration...");

try {
  // --- RSS FEED CREATOR ---
  router.get("/api/rss/health", (_req, res) =>
    res.status(200).json({ status: "ok", service: "rss-feed-creator" })
  );
  router.use("/rss", rssRoutes);
  info("📰 Mounted: /rss/rewrite");

  // --- SCRIPT GENERATION ---
  router.use("/script", scriptRoutes);
  info("✍️ Mounted: /script");

  // --- TTS SERVICE ---
  router.use("/tts", ttsRoutes);
  info("🗣️ Mounted: /tts");

  // --- ARTWORK CREATION ---
  router.use("/artwork", artworkRoutes);
  info("🎨 Mounted: /artwork");

  // --- PODCAST GENERATION (FIXED) ---
  router.use("/podcast", podcastRoutes);
  info("🎧 Mounted: /podcast");

  // --- PODCAST PIPELINE (FIXED) ---
  router.use("/podcast/pipeline", podcastPipelineRoutes);
  info("🧩 Mounted: /podcast/pipeline");

  info("✅ All routes mounted successfully.");
} catch (err) {
  error("💥 Failed during route registration", { error: err.stack });
}

export default router;
