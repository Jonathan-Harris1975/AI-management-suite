// routes/index.js
import express from "express";
import { info, error } from "#logger.js";

// ─────────────────────────────
//  SERVICE ROUTES
// ─────────────────────────────
import rssRoutes from "../services/rss-feed-creator/routes/rewrite.js";
import scriptRoutes from "../services/script/routes/index.js";
import ttsRoutes from "../services/tts/routes/tts.js";
import artworkRoutes from "../services/artwork/index.js";
import podcastRoutes from "../services/podcast/index.js"; // ✅ Correct route import

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
  router.use("/rss", rssRoutes);
  info("📰 Mounted: /rss");

  // ─────────────────────────────
  //  SCRIPT GENERATION & ORCHESTRATION
  // ─────────────────────────────
  router.use("/script", scriptRoutes);
  info("✍️ Mounted: /script");

  // ─────────────────────────────
  //  TTS SERVICE
  // ─────────────────────────────
  router.use("/tts", ttsRoutes);
  info("🔊 Mounted: /tts");

  // ─────────────────────────────
  //  ARTWORK CREATION
  // ─────────────────────────────
  router.use("/artwork", artworkRoutes);
  info("🎨 Mounted: /artwork");

  // ─────────────────────────────
  //  PODCAST GENERATION
  // ─────────────────────────────
  // Includes both /podcast/run and /podcast/health
  router.use("/podcast", podcastRoutes);
  info("🎧 Mounted: /podcast");

  info("✅ All routes mounted successfully.");
} catch (err) {
  error("💥 Failed during route registration", { error: err.stack });
}

export default router;
