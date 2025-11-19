// ============================================================
// 🎨 Artwork Generator — Express Route + Function Export
// ============================================================

import express from "express";
import fetch from "node-fetch";
import { putObject } from "#shared/r2-client.js";
import { info, error } from "#logger.js";

const router = express.Router();

// ------------------------------------------------------------
// Generate Artwork Function
// ------------------------------------------------------------
export async function generateArtwork(sessionId, prompt = '') {
  const url = "https://openrouter.ai/api/v1/chat/completions";
  if (!prompt || !prompt.trim()) {
    prompt = `Podcast cover art for ${sessionId} — abstract AI-themed design, high-contrast, bold typography`;
  }

  const safeTitle = encodeURIComponent(
    process.env.APP_TITLE || "Turing's Torch: AI Weekly Artwork"
  );

  const headers = {
    Authorization: `Bearer ${process.env.OPENROUTER_API_KEY_ART}`,
    "Content-Type": "application/json",
    "HTTP-Referer": process.env.APP_URL || "https://jonathan-harris.online",
    "X-Title": safeTitle,
  };

  const body = JSON.stringify({
    model: process.env.OPENROUTER_ART || "google/gemini-2.5-flash-image",
    messages: [
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: prompt || `Podcast artwork for session ${sessionId}`,
          },
        ],
      },
    ],
  });

  try {
    const res = await fetch(url, { method: "POST", headers, body });
    if (!res.ok) {
      const msg = await res.text();
      throw new Error(`Artwork generation failed: ${msg.slice(0, 200)}`);
    }

    const json = await res.json();
    const imageData = json?.choices?.[0]?.message?.content?.[0]?.image_data;
    if (!imageData) throw new Error("No image data returned from OpenRouter.");

    const buffer = Buffer.from(imageData, "base64");
    const key = `${sessionId}.png`;

    await putObject("art", key, buffer, "image/png");

    const publicUrl = `${process.env.R2_PUBLIC_BASE_URL_ART}/${encodeURIComponent(key)}`;
    info("🎨 Artwork saved to R2", { sessionId, key, publicUrl });

    return publicUrl;
  } catch (err) {
    error("💥 Artwork generation failed", { sessionId, error: err.message });
    throw err;
  }
}

// ------------------------------------------------------------
// Express Route Wrapper
// ------------------------------------------------------------
router.post("/generate", async (req, res) => {
  const sessionId = req.body.sessionId || `art-${Date.now()}`;
  const prompt = req.body.prompt || "Podcast cover art: abstract AI design";
  try {
    const url = await generateArtwork(sessionId, prompt);
    res.json({ ok: true, sessionId, url });
  } catch (err) {
    error("💥 Artwork route failed", { sessionId, error: err.message });
    res.status(500).json({ ok: false, error: err.message });
  }
});

export default router;
