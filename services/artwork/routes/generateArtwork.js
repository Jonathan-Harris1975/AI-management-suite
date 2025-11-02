// services/artwork/routes/generateArtwork.js
import express from "express";
import fetch from "node-fetch";
import { putObject, buildPublicUrl } from "../../shared/utils/r2-client.js";
import * as sessionCache from "../../script/utils/sessionCache.js";
import { info, error } from "#logger.js";

const router = express.Router();

/**
 * Generate an image using the Nano Banana model on OpenRouter.
 */
async function generateImageBase64(prompt) {
  const url = "https://openrouter.ai/api/v1/images";
  const headers = {
    Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
    "Content-Type": "application/json",
    "HTTP-Referer": process.env.APP_URL || "https://jonathan-harris.online",
    "X-Title": process.env.APP_TITLE || "Turing’s Torch: AI Weekly Artwork",
  };
  const body = JSON.stringify({
    model: process.env.OPENROUTER_ART || "google/gemini-2.0-nano-banana",
    prompt,
    size: "1024x1024",
    response_format: "b64_json",
  });

  const resp = await fetch(url, { method: "POST", headers, body });
  if (!resp.ok) {
    const msg = await resp.text();
    throw new Error(`OpenRouter image generation failed: ${msg}`);
  }

  const json = await resp.json();
  const b64 = json?.data?.[0]?.b64_json;
  if (!b64) throw new Error("No image data returned from OpenRouter.");
  return b64;
}

/**
 * POST /artwork/generate
 * Body: { sessionId: "TT-2025-11-01" }
 */
router.post("/", async (req, res) => {
  const { sessionId } = req.body || {};
  if (!sessionId) return res.status(400).json({ error: "Missing sessionId" });

  try {
    info("artwork.generate.start", { sessionId });

    const prompt = await sessionCache.getTempPart(sessionId, "artworkPrompt");
    if (!prompt) throw new Error("No artwork prompt in temporary memory.");

    const b64 = await generateImageBase64(prompt);
    const buffer = Buffer.from(b64, "base64");

    const key = `${sessionId}.png`;
    await putObject("art", key, buffer, "image/png");
    const publicUrl = buildPublicUrl("art", key);

    console.log(`
🎨 Artwork Generated Successfully
───────────────────────────────────────────────
Session ID: ${sessionId}
Bucket: podcastart
Key: ${key}
Size: ${(buffer.length / 1024).toFixed(1)} KB
URL: ${publicUrl}
───────────────────────────────────────────────
`);

    return res.json({ ok: true, key, url: publicUrl });
  } catch (err) {
    error("artwork.generate.fail", { sessionId, error: err.message });
    res.status(500).json({ ok: false, error: err.message });
  }
});

export default router;
