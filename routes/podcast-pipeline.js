// ============================================================
// 🧵 Podcast Pipeline Route
// Runs: script/orchestrate -> tts -> artwork/generate
// ============================================================

import express from "express";
import { info, error } from "#logger.js";

const router = express.Router();

function baseUrl() {
  const port = process.env.PORT || 3000;
  const host = process.env.INTERNAL_BASE_HOST || "127.0.0.1";
  const proto = process.env.INTERNAL_BASE_PROTO || "http";
  return `${proto}://${host}:${port}`;
}

/**
 * POST /podcast/pipeline
 * Body: { sessionId?: string, date?: string, topic?: string, tone?: object }
 */
router.post("/podcast/pipeline", async (req, res) => {
  const sessionId = req.body?.sessionId || `TT-${Date.now()}`;
  const date = req.body?.date;
  const topic = req.body?.topic || null;
  const tone = req.body?.tone || {};

  const base = baseUrl();
  info("🎧 Podcast pipeline start", { sessionId });

  try {
    // 1) SCRIPT ORCHESTRATION
    const scriptResp = await fetch(`${base}/script/orchestrate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId, date, topic, tone }),
    });
    if (!scriptResp.ok) throw new Error(`Script orchestration failed: ${scriptResp.status}`);
    const scriptData = await scriptResp.json();

    // Some script flows emit metaUrl data under compose step; keep optional.
    const metaUrls =
      scriptData?.steps?.compose?.metaUrls ||
      scriptData?.metaUrls ||
      null;

    // 2) TTS (services/tts/routes/tts.js mounted at /tts)
    const ttsResp = await fetch(`${base}/tts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId }),
    });
    if (!ttsResp.ok) throw new Error(`TTS failed: ${ttsResp.status}`);
    const ttsData = await ttsResp.json();

    // 3) ARTWORK (non-blocking; return warning if fails)
    let artworkData = { ok: false };
    try {
      const artResp = await fetch(`${base}/artwork/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, metaUrls }),
      });
      if (!artResp.ok) throw new Error(`Artwork failed: ${artResp.status}`);
      artworkData = await artResp.json();
    } catch (artErr) {
      error("🎨 Artwork generation failed (non-blocking)", { sessionId, error: artErr.message });
    }

    info("✅ Podcast pipeline complete", { sessionId });

    res.json({
      ok: true,
      sessionId,
      script: scriptData,
      tts: ttsData,
      artwork: artworkData,
    });
  } catch (err) {
    error("💥 Podcast pipeline failed", { sessionId, error: err.message });
    res.status(500).json({ ok: false, error: err.message, sessionId });
  }
});

export default router;
