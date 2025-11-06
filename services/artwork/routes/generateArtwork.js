// services/artwork/routes/generateArtwork.js
import express from "express";
import fetch from "node-fetch";
import * as sessionCache from "../../script/utils/sessionCache.js";
import { putObject, buildPublicUrl } from "../../shared/utils/r2-client.js";
import { info, error } from "#logger.js";

const router = express.Router();

/**
 * Generate artwork via OpenRouter (Gemini image model)
 * - Uses /api/v1/chat/completions instead of the old /api/v1/images
 * - Handles HTML responses safely
 * - Sanitizes headers to prevent invalid character errors
 */
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
    model:
      process.env.OPENROUTER_ART_MODEL ||
      "google/gemini-2.0-flash-exp:free",
    messages: [
      {
        role: "user",
        content: `Generate a detailed square image (3000x3000) illustrating: ${prompt}`,
      },
    ],
  });

  const resp = await fetch(url, { method: "POST", headers, body });
  const text = await resp.text();

  // Defensive: handle unexpected HTML / errors from OpenRouter
  if (!resp.ok || text.trim().startsWith("<")) {
    throw new Error(
      `OpenRouter image generation failed (${resp.status}): ${text.slice(
        0,
        200
      )}`
    );
  }

  const json = JSON.parse(text);
  
  // Extract base64 from various possible response structures
  let b64 = null;
  
  // Check chat completion structure with content array
  if (json?.choices?.[0]?.message?.content) {
    const content = json.choices[0].message.content;
    
    // If content is an array with data field
    if (Array.isArray(content) && content[0]?.data) {
      b64 = content[0].data;
    }
    // If content is a string (base64)
    else if (typeof content === 'string' && content.length > 100) {
      b64 = content;
    }
  }
  
  // Fallback to direct data field
  if (!b64 && json?.data?.[0]?.b64_json) {
    b64 = json.data[0].b64_json;
  }
  
  // Fallback to root b64_json field
  if (!b64 && json?.b64_json) {
    b64 = json.b64_json;
  }

  if (!b64) {
    throw new Error(
      `No base64 image returned from OpenRouter. Response structure: ${JSON.stringify(
        json
      ).slice(0, 500)}`
    );
  }
  
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
    if (!prompt) {
      throw new Error("No artwork prompt found in temporary memory");
    }

    // Generate image base64
    const b64 = await generateImageBase64(prompt);
    const buffer = Buffer.from(b64, "base64");

    const key = `${sessionId}-artwork.png`;
    // putObject expects (alias, key, buffer, contentType)
    await putObject("art", key, buffer, "image/png");
    const url = buildPublicUrl("art", key);

    const took = ((Date.now() - start) / 1000).toFixed(2);
    console.log("\n🎨 Artwork Generated Successfully");
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
