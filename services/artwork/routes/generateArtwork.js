// services/artwork/routes/generateArtwork.js
import express from "express";
import fetch from "node-fetch";
import { putObject } from "#shared/r2-client.js";
import { info, error } from "#logger.js";

const router = express.Router();

async function generateImageBase64(prompt) {
  const url = "https://openrouter.ai/api/v1/chat/completions";

  const safeTitle = encodeURIComponent(
    process.env.APP_TITLE || "Turings Torch: AI Weekly Artwork"
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
        content: `Generate a detailed square image (3000x3000) illustrating: ${prompt}`,
      },
    ],
  });

  const resp = await fetch(url, { method: "POST", headers, body });
  const text = await resp.text();

  // Handle OpenRouter errors (HTML or API failure)
  if (!resp.ok || text.trim().startsWith("<")) {
    throw new Error(
      `OpenRouter image generation failed (${resp.status}): ${text.slice(0, 200)}`
    );
  }

  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error("Invalid JSON returned from OpenRouter (likely HTML or rate-limited response)");
  }

  let b64 = null;
  const msg = json?.choices?.[0]?.message;

  // ✅ 1. Primary — new structure: message.images
  if (msg?.images && Array.isArray(msg.images)) {
    const imgItem = msg.images.find(
      i => i.image_url?.url?.startsWith("data:image/png;base64,")
    );
    if (imgItem) b64 = imgItem.image_url.url.split(",")[1];
  }

  // ✅ 2. Fallback — content array with image_url
  if (!b64 && Array.isArray(msg?.content)) {
    const imgItem = msg.content.find(
      i => i.type === "image_url" && i.image_url?.url?.startsWith("data:image/png;base64,")
    );
    if (imgItem) b64 = imgItem.image_url.url.split(",")[1];
  }

  // ✅ 3. Fallback — direct content string
  if (!b64 && typeof msg?.content === "string" && msg.content.includes("data:image/png;base64,")) {
    b64 = msg.content.split("data:image/png;base64,")[1].split('"')[0];
  }

  if (!b64) {
    throw new Error(
      `No base64 image returned from OpenRouter. Response structure: ${JSON.stringify(
        json,
        null,
        2
      ).slice(0, 400)}`
    );
  }

  return b64;
}

router.post("/", async (req, res) => {
  try {
    const { prompt } = req.body;
    if (!prompt) throw new Error("Missing 'prompt' in body");

    const b64 = await generateImageBase64(prompt);
    const pngBuffer = Buffer.from(b64, "base64");

    const bucket = process.env.R2_BUCKET_ART;
    if (!bucket) throw new Error("R2_BUCKET_ART not set");

    const key = `artwork/generated/${Date.now()}.png`;
    await putObject(bucket, key, pngBuffer, "image/png");
    info("artwork.generate.uploaded", { bucket, key });

    const url = `${process.env.R2_PUBLIC_BASE_URL_ART.replace(/\\/+$, "")}/${key}`;
    res.json({ ok: true, url });
  } catch (err) {
    error("artwork.generate.fail", { message: err.message });
    res.status(500).json({ ok: false, error: err.message });
  }
});

export default router;
