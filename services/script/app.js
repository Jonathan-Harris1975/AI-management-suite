// services/script/app.js
import express from "express";
import bodyParser from "body-parser";
import cors from "cors";
import { info } from "#logger.js";

import {
  generateIntro,
  generateMain,
  generateOutro,
  generateComposedEpisode,
} from "./utils/models.js";

// ✅ Correct import for your actual structure
import weatherHandler from "./api/weather.js";
app.get("/api/weather", weatherHandler);

const app = express();
app.use(cors());
app.use(bodyParser.json({ limit: "10mb" }));

// ─────────────────────────────────────────────
// 🩺 HEALTH CHECK
// ─────────────────────────────────────────────
app.get("/api/script/health", (req, res) => {
  res.json({ status: "ok", service: "script" });
});

// ─────────────────────────────────────────────
// 🌦️ WEATHER ENDPOINT (from ./api/weather.js)
// ─────────────────────────────────────────────
app.get("/api/weather", weatherHandler);

// ─────────────────────────────────────────────
// 🧠 PODCAST SCRIPT GENERATION ENDPOINTS
// ─────────────────────────────────────────────
app.post("/script/intro", async (req, res) => {
  try {
    const result = await generateIntro(req.body);
    res.json({ success: true, text: result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/script/main", async (req, res) => {
  try {
    const result = await generateMain(req.body);
    res.json({ success: true, text: result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/script/outro", async (req, res) => {
  try {
    const result = await generateOutro(req.body);
    res.json({ success: true, text: result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/script/compose", async (req, res) => {
  try {
    const result = await generateComposedEpisode(req.body);
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────
// ✅ STARTUP LOG
// ─────────────────────────────────────────────
info("✅ Script service initialized with weather + Turing integration");

export default app;
