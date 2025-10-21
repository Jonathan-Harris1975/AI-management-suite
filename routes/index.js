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
import podcastRoutes from "../services/podcast/routes/podcast.js";
import podcastPipelineRoutes from "../services/podcast/routes/pipeline.js";

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

  // --- SCRIPT SERVICE ---
  router.use("/script", scriptRoutes);
  info("📜 Mounted: /script/(intro|main|outro|compose)");

  // --- TTS SERVICE ---
  router.use("/tts", ttsRoutes);
  info("🔊 Mounted: /tts");

  // --- ARTWORK SERVICE ---
  router.use("/artwork", artworkRoutes);
  info("🎨 Mounted: /artwork/generate");

  // --- PODCAST SERVICE ---
  router.get("/api/podcast/health", (_req, res) =>
    res.status(200).json({ status: "ok", service: "podcast" })
  );
  router.use("/podcast", podcastRoutes);
  router.use("/podcast/pipeline", podcastPipelineRoutes);
  info("🎧 Mounted: /api/podcast/health");
  info("🎙️ Mounted: /podcast");
  info("🧵 Mounted: /podcast/pipeline");
} catch (err) {
  error("💥 Route registration failed", { err: err.message });
}

export default router;
