import express from "express";
import log from "../utils/root-logger.js";

const router = express.Router();

function baseUrl() {
  const port = process.env.PORT || 3000;
  const host = process.env.INTERNAL_BASE_HOST || "127.0.0.1";
  const proto = process.env.INTERNAL_BASE_PROTO || "http";
  return `${proto}://${host}:${port}`;
}

router.post("/podcast/pipeline", async (req, res) => {
  const sessionId = req.body?.sessionId || `TT-${Date.now()}`;
  const date = req.body?.date;
  const topic = req.body?.topic || null;
  const tone = req.body?.tone || {};

  const base = baseUrl();
  log.info("🎧 podcast.pipeline.start", { sessionId });

  try {
    const scriptResp = await fetch(`${base}/script/orchestrate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId, date, topic, tone }),
    });
    if (!scriptResp.ok) {
      throw new Error(`Script orchestration failed: ${scriptResp.status}`);
    }
    const scriptData = await scriptResp.json();

    const metaUrls =
      scriptData?.steps?.compose?.metaUrls ||
      scriptData?.metaUrls ||
      null;

    const ttsResp = await fetch(`${base}/tts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId }),
    });
    if (!ttsResp.ok) {
      throw new Error(`TTS failed: ${ttsResp.status}`);
    }
    const ttsData = await ttsResp.json();

    let artworkData = { ok: false };
    try {
      const artResp = await fetch(`${base}/artwork/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, metaUrls }),
      });
      if (!artResp.ok) {
        throw new Error(`Artwork failed: ${artResp.status}`);
      }
      artworkData = await artResp.json();
    } catch (artErr) {
      log.error("🎨 artwork.generate.failed.nonblocking", {
        sessionId,
        error: artErr.message,
      });
    }

    log.info("✅ podcast.pipeline.complete", { sessionId });

    res.json({
      ok: true,
      sessionId,
      script: scriptData,
      tts: ttsData,
      artwork: artworkData,
    });
  } catch (err) {
    log.error("💥 podcast.pipeline.failed", { sessionId, error: err.message });
    res.status(500).json({ ok: false, error: err.message, sessionId });
  }
});

export default router;
