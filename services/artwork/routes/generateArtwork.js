// services/artwork/routes/generateArtwork.js
import express from "express";
import fetch from "node-fetch";
import * as sessionCache from "../../script/utils/sessionCache.js";
import { putObject, buildPublicUrl } from "../../shared/utils/r2-client.js";
import { info, error } from "#logger.js";

const router = express.Router();

async function generateImageBase64(prompt) {
  const url = "https://openrouter.ai/api/v1/images";

  // ✅ FIX: sanitize unsafe Unicode characters in X-Title header
  const safeTitle =
    encodeURIComponent(
      process.env.APP_TITLE || "Turings Torch: AI Weekly Artwork"
    );

  const headers = {
    Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
    "Content-Type": "application/json",
    "HTTP-Referer": process.env.APP_URL || "https://jonathan-harris.online",
    "X-Title": safeTitle,
  };

  const body = JSON.stringify({
    model:
      process.env.OPENROUTER_ART ||
      "google/gemini-2.5-flash-image-preview",
    prompt,
    size: "3000x3000",
    response_format: "b64_json",
  });

  const resp = await fetch(url, { method: "POST", headers, body });
  if (!resp.ok) {
    const txt = await resp.text();
    throw new Error(`OpenRouter image generation failed: ${resp.status} ${txt}`);
  }

  const json = await resp.json();
  const b64 = json?.data?.[0]?.b64_json || json?.b64_json || null;
  if (!b64) throw new Error("No base64 image returned from OpenRouter.");
  return b64;
}

// POST /artwork/generate
// Body: { sessionId: "TT-2025-11-01" }
router.post("/", async (req, res) => {
  const { sessionId } = req.body || {};
  if (!sessionId) return res.status(400).json({ error: "Missing sessionId" });

  const start = Date.now();
  try {
    info("artwork.generate.start", { sessionId });

    const prompt = await sessionCache.getTempPart(sessionId, "artworkPrompt");
    if (!prompt)
      throw new Error("No artwork prompt found in temporary memory");

    // generate image base64
    const b64 = await generateImageBase64(prompt);
    const buffer = Buffer.from(b64, "base64");

    const key = `${sessionId}-artwork.png`;
    // putObject expects (alias, key, buffer, contentType) in your r2-client mapping
    await putObject("art", key, buffer, "image/png");
    const url = buildPublicUrl("art", key);

    const took = ((Date.now() - start) / 1000).toFixed(2);
    console.log("\n🎨 Artwork Generated Successfully (Nano Banana)");
    console.table({
      sessionId,
      bucket: "podcastart",
      key,
      sizeKB: (buffer.length / 1024).toFixed(1),
      url,
      took_s: took,
    });

    info("artwork.generate.success", {
      sessionId,
      key,
      bytes: buffer.length,
      took_s: took,
    });

    return res.json({
      ok: true,
      key,
      url,
      bytes: buffer.length,
      took_s: took,
    });
  } catch (err) {
    error("artwork.generate.fail", { sessionId, message: err.message });
    return res.status(500).json({ ok: false, error: err.message });
  }
});

export default router;
