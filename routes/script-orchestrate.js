// ============================================================
// 🎬 Script Orchestration Route
// Runs: intro -> main -> outro -> compose
// ============================================================

import express from "express";
import { info, error } from "../services/shared/utils/logger.js";

const router = express.Router();

function baseUrl() {
  const port = process.env.PORT || 3000;
  const host = process.env.INTERNAL_BASE_HOST || "127.0.0.1";
  const proto = process.env.INTERNAL_BASE_PROTO || "http";
  return `${proto}://${host}:${port}`;
}

/**
 * POST /script/orchestrate
 * Body: { sessionId?: string, date?: string, reset?: boolean, topic?: string, tone?: object }
 */
router.post("/script/orchestrate", async (req, res) => {
  const sessionId = req.body?.sessionId || `TT-${Date.now()}`;
  const date = req.body?.date;
  const reset = req.body?.reset ?? false;
  const topic = req.body?.topic || null;
  const tone = req.body?.tone || {};

  const base = baseUrl();
  info("🎬 Script orchestration start", { sessionId });

  try {
    // 1) Intro
    const introResp = await fetch(`${base}/script/intro`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId, date, reset, topic, tone }),
    });
    if (!introResp.ok) throw new Error(`Intro failed: ${introResp.status}`);
    const introData = await introResp.json();

    // 2) Main
    const mainResp = await fetch(`${base}/script/main`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId, date, topic, tone }),
    });
    if (!mainResp.ok) throw new Error(`Main failed: ${mainResp.status}`);
    const mainData = await mainResp.json();

    // 3) Outro
    const outroResp = await fetch(`${base}/script/outro`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId, date, topic, tone }),
    });
    if (!outroResp.ok) throw new Error(`Outro failed: ${outroResp.status}`);
    const outroData = await outroResp.json();

    // 4) Compose
    const composeResp = await fetch(`${base}/script/compose`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId, date }),
    });
    if (!composeResp.ok) throw new Error(`Compose failed: ${composeResp.status}`);
    const composeData = await composeResp.json();

    info("✅ Script orchestration complete", { sessionId });

    res.json({
      ok: true,
      sessionId,
      steps: {
        intro: introData,
        main: mainData,
        outro: outroData,
        compose: composeData,
      },
    });
  } catch (err) {
    error("💥 Script orchestration failed", { sessionId, error: err.message });
    res.status(500).json({ ok: false, error: err.message, sessionId });
  }
});

export default router;
