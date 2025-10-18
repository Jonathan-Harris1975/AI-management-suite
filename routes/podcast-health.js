// ============================================================
// 🎧 Podcast Health Check
// ============================================================
//
// GET /api/podcast-health → returns basic status + last run info
// ============================================================

import express from "express";
import { log } from "#shared/logger.js";

const router = express.Router();

// Minimal in-memory status; you can later pull this from R2 meta or logs
let lastRun = null;

export function setLastRun(time) {
  lastRun = time;
}

router.get("/api/podcast/health", (_req, res) => {
  const ok = true;
  log.info("podcast.health.checked", { ok, lastRun });
  res.json({
    ok,
    service: "podcast",
    message: "Podcast pipeline route active",
    lastRun,
  });
});

export default router;
