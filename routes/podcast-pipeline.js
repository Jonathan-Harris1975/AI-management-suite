// ============================================================
// 🧵 Podcast Pipeline Route  (FIXED VERSION)
// Now mounted at POST /podcast
// ============================================================

router.post("/", async (req, res) => {
  const sessionId = req.body?.sessionId || `TT-${Date.now()}`;
  const date = req.body?.date;
  const topic = req.body?.topic || null;
  const tone = req.body?.tone || {};

  const base = baseUrl();
  info("🎧 Podcast pipeline start", { sessionId });

  try {
    // 1) SCRIPT
    const scriptResp = await fetch(`${base}/script/orchestrate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId, date, topic, tone }),
    });
    if (!scriptResp.ok) throw new Error(`Script orchestration failed: ${scriptResp.status}`);
    const scriptData = await scriptResp.json();

    const metaUrls =
      scriptData?.steps?.compose?.metaUrls ||
      scriptData?.metaUrls ||
      null;

    // 2) TTS
    const ttsResp = await fetch(`${base}/tts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId }),
    });
    if (!ttsResp.ok) throw new Error(`TTS failed: ${ttsResp.status}`);
    const ttsData = await ttsResp.json();

    // 3) ARTWORK
    let artworkData = { ok: false };
    try {
      const artResp = await fetch(`${base}/artwork/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, metaUrls }),
      });
      if (artResp.ok) artworkData = await artResp.json();
    } catch (err) {
      error("🎨 Artwork generation failed (non-blocking)", { sessionId, error: err.message });
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
