// /routes/rewrite.js — rewrite endpoint (clean)
import express from "express";
import { runRewritePipeline } from "../services/rss-feed-creator/rewrite-pipeline.js";

const router = express.Router();

function log(message, meta) {
  const entry = { time: new Date().toISOString(), message };
  if (meta && typeof meta === "object") entry.meta = meta;
  process.stdout.write(JSON.stringify(entry) + "\n");
}

// Quick health probe
router.get("/health", (_req, res) => {
  res.json({ ok: true, service: "rewrite" });
});

// Kick the pipeline
router.post("/run", async (req, res) => {
  log("rewrite: POST /run");
  try {
    const result = await runRewritePipeline();
    res.json({ ok: true, result });
  } catch (err) {
    log("rewrite: pipeline failed", { error: err?.message || String(err) });
    res.status(500).json({
      ok: false,
      error: err?.message || "Unknown error",
      // only include stack in dev
      stack: (process.env.NODE_ENV || "").toLowerCase() === "development" ? err?.stack : undefined,
    });
  }
});

export default router;
