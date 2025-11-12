// server.js
import express from "express";
import cors from "cors";
import os from "os";
import { info, warn, error, debug, log as logger } from "#logger.js";
import routes from "./routes/index.js";

const app = express();
app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));


// Lightweight HTTP request logger
app.use((req, res, next) => {
  const started = Date.now();
  res.on("finish", () => {
    const ms = Date.now() - started;
    info("➡️ HTTP", { method: req.method, url: req.originalUrl || req.url, statusCode: res.statusCode, ms, ip: req.ip });
  });
  next();
});
// Mount all routes at once
app.use("/", routes);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  const mode = process.env.NODE_ENV || "development";
  const node = process.version;
  const host = process.env.INTERNAL_BASE_HOST || "0.0.0.0";
  info("🧠 AI Podcast Suite started", { port: PORT, mode, node, host });
  info("📡 Endpoints ready: RSS, Script, TTS, Artwork, Podcast");
});
