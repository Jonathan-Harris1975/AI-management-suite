// ============================================================
// 🌍 AI Management Suite — Server Bootstrap (Final Stable Build)
// ============================================================
//
// ✅ Includes:
//   • RSS Health Check (/api/rss/health)
//   • RSS Rewrite Pipeline (/rss/rewrite)
//   • Podcast Health Check (/api/podcast/health)
//   • Podcast Main Route (/podcast)
//   • Express setup with JSON, URL-encoded body parser, CORS
// ============================================================

import express from "express";
import cors from "cors";
import { log } from "./services/shared/utils/logger.js";

const app = express();
const PORT = process.env.PORT || 3000;

// ------------------------------------------------------------
// 🧩 Middleware
// ------------------------------------------------------------
app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

// ------------------------------------------------------------
// 🩺 Root Health Check
// ------------------------------------------------------------
app.get("/", (_req, res) => {
  res.json({
    service: "AI Management Suite",
    status: "online",
    endpoints: [
      "/api/rss/health",
      "/rss/rewrite",
      "/api/podcast/health",
      "/podcast",
    ],
  });
});

// ------------------------------------------------------------
// ⚙️ Dynamic Route Registration
// ------------------------------------------------------------
(async () => {
  try {
    log.info("🚀 Starting route registration...");

    // 🧠 RSS Health
    try {
      app.get("/api/rss/health", (_req, res) => {
        res.json({
          ok: true,
          service: "RSS Feed Creator",
          status: "healthy",
          timestamp: new Date().toISOString(),
        });
      });
      log.info("🧩 Mounted: /api/rss/health");
    } catch (err) {
      log.error("💥 RSS Health route failed", { error: err.stack });
    }

    // 📰 RSS Rewrite
    try {
      const { default: rssRewriteRouter } = await import("./routes/rewrite.js");
      app.use(rssRewriteRouter);
      log.info("🧩 Mounted: /rss/rewrite");
    } catch (err) {
      log.error("💥 RSS Rewrite route failed", { error: err.stack });
    }

    // 🎧 Podcast Health
    try {
      app.get("/api/podcast/health", (_req, res) => {
        res.json({
          ok: true,
          service: "Podcast Engine",
          status: "healthy",
          timestamp: new Date().toISOString(),
        });
      });
      log.info("🎧 Mounted: /api/podcast/health");
    } catch (err) {
      log.error("💥 Podcast Health route failed", { error: err.stack });
    }

    // 🎙️ Podcast Main Route
    try {
      const { default: podcastRouter } = await import("./routes/podcast.js");
      if (!podcastRouter)
        throw new Error("Missing default export in routes/podcast.js");
      app.use("/podcast", podcastRouter);
      log.info("🎙️ Mounted: /podcast");
    } catch (err) {
      log.error("💥 Podcast route failed to load", { error: err.stack });
    }

    // --------------------------------------------------------
    // 🚀 Final Startup Confirmation
    // --------------------------------------------------------
    app.listen(PORT, () => {
      log.info("🌍 Server started successfully");
      log.info("---------------------------------------------");
      log.info("✅ Active Endpoints:");
      log.info("🧠 → GET  /api/rss/health");
      log.info("📰 → POST /rss/rewrite");
      log.info("🎧 → GET  /api/podcast/health");
      log.info("🎙️ → ALL  /podcast");
      log.info("---------------------------------------------");
    });
  } catch (outerErr) {
    log.error("💥 Fatal server startup error", { error: outerErr.stack });
    process.exit(1);
  }
})();
