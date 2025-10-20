// server.js
import express from "express";
import cors from "cors";
import os from "os";
import { info } from "./shared/utils/logger.js";
import routes from "./routes/index.js";

info("=============================================");
info("🧠 AI Podcast Suite - Environment Bootstrap");
info("=============================================");

const app = express();
app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

// Mount all routes at once
app.use("/", routes);

const PORT = process.env.PORT || 3000;
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
