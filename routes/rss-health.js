// ============================================================
// 🧠 AI Podcast Suite — Basic RSS Health Route
// ============================================================
//
// Purpose: lightweight "keep-alive" / uptime endpoint
// No external service calls — just confirms the container is awake.
// ============================================================

import express from "express";
import { info } from "#shared/logger.js";

const router = express.Router();

router.get("/api/rss/health", (_req, res) => {
  const now = new Date().toISOString();
  info("🧠 RSS basic health check", { ok: true, time: now });

  return res.json({
    ok: true,
    service: "rss",
    status: "awake",
    timestamp: now,
    message: "AI Podcast Suite RSS health endpoint active",
  });
});

export default router;
