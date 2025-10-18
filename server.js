// ============================================================
// 🌍 AI Management Suite — Server Bootstrap (with Orchestrators)
// ============================================================

import express from "express";
import cors from "cors";
import { info, error } from "./services/shared/utils/logger.js";

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

// Root health
app.get("/", (_req, res) => {
  res.json({
    service: "AI Management Suite",
    status: "online",
    endpoints: [
      "/api/rss/health",
      "/rss/rewrite",
      "/api/podcast/health",
      "/podcast",
      "/script/intro",
      "/script/main",
      "/script/outro",
      "/script/compose",
      "/script/orchestrate",
      "/tts",
      "/artwork/*",
      "/podcast/pipeline",
    ],
  });
});

(async () => {
  try {
    info("🚀 Starting route registration...");

    // RSS Health (basic)
    app.get("/api/rss/health", (_req, res) => {
      res.json({
        ok: true,
        service: "RSS Feed Creator",
        status: "healthy",
        ts: new Date().toISOString(),
      });
    });
    info("🧠 Mounted: /api/rss/health");

    // RSS Rewrite
    try {
      const { default: rssRewriteRouter } = await import("./routes/rewrite.js");
      app.use(rssRewriteRouter);
      info("📰 Mounted: /rss/rewrite");
    } catch (err) {
      error("💥 RSS Rewrite route failed", { error: err.message });
    }

    // Script routes (existing)
    try {
      const { default: scriptIntro } = await import("./services/script/routes/intro.js");
      const { default: scriptMain } = await import("./services/script/routes/main.js");
      const { default: scriptOutro } = await import("./services/script/routes/outro.js");
      const { default: scriptCompose } = await import("./services/script/routes/compose.js");

      app.use("/script/intro", scriptIntro);
      app.use("/script/main", scriptMain);
      app.use("/script/outro", scriptOutro);
      app.use("/script/compose", scriptCompose);
      info("📜 Mounted: /script/(intro|main|outro|compose)");
    } catch (err) {
      error("💥 Script subroutes failed", { error: err.message });
    }

    // Script Orchestrator (new)
    try {
      const { default: scriptOrchestrate } = await import("./routes/script-orchestrate.js");
      app.use(scriptOrchestrate);
      info("🎬 Mounted: /script/orchestrate");
    } catch (err) {
      error("💥 Script orchestrator route failed", { error: err.message });
    }

    // TTS routes (existing)
    try {
      const { default: ttsRouter } = await import("./services/tts/routes/tts.js");
      app.use("/tts", ttsRouter);
      info("🔊 Mounted: /tts");
    } catch (err) {
      error("💥 TTS route failed", { error: err.message });
    }

    // Artwork routes (existing index with /generate)
    try {
      const { default: artworkRoutes } = await import("./services/artwork/routes/index.js");
      app.use("/artwork", artworkRoutes);
      info("🎨 Mounted: /artwork");
    } catch (err) {
      error("💥 Artwork routes failed", { error: err.message });
    }

    // Podcast Health (basic)
    app.get("/api/podcast/health", (_req, res) => {
      res.json({
        ok: true,
        service: "Podcast Engine",
        status: "healthy",
        ts: new Date().toISOString(),
      });
    });
    info("🎧 Mounted: /api/podcast/health");

    // Podcast main route (existing)
    try {
      const { default: podcastRouter } = await import("./routes/podcast.js");
      app.use("/podcast", podcastRouter);
      info("🎙️ Mounted: /podcast");
    } catch (err) {
      error("💥 Podcast default route failed", { error: err.message });
    }

    // Podcast pipeline orchestrator (new)
    try {
      const { default: podcastPipeline } = await import("./routes/podcast-pipeline.js");
      app.use(podcastPipeline);
      info("🧵 Mounted: /podcast/pipeline");
    } catch (err) {
      error("💥 Podcast pipeline route failed", { error: err.message });
    }

    app.listen(PORT, () => {
      info("🌍 Server started successfully");
      info("---------------------------------------------");
      info("✅ Active Endpoints:");
      info("🧠 → GET  /api/rss/health");
      info("📰 → POST /rss/rewrite");
      info("📜 → POST /script/(intro|main|outro|compose)");
      info("🎬 → POST /script/orchestrate");
      info("🔊 → POST /tts");
      info("🎨 → POST /artwork/generate");
      info("🎧 → GET  /api/podcast/health");
      info("🎙️ → GET|POST /podcast");
      info("🧵 → POST /podcast/pipeline");
      info("---------------------------------------------");
    });
  } catch (outerErr) {
    error("💥 Fatal server startup error", { error: outerErr.stack });
    process.exit(1);
  }
})();
