// ============================================================
// 🎨 services/artwork/routes/generate.js
// ============================================================
//
// Uses existing OpenRouter (Nano Banana) setup via ai-service.js
// Generates a PNG based on the saved artwork prompt in sessionCache
// and uploads it to the podcastart R2 bucket.
//
// ============================================================

import express from "express";
import { r2Put } from "../../shared/utils/r2-client.js";
import * as sessionCache from "../../script/utils/sessionCache.js";
import { resilientRequest } from "../../shared/utils/ai-service.js";
import { info, error } from "#logger.js";

const router = express.Router();

router.post("/generate", async (req, res) => {
  const { sessionId } = req.body || {};
  if (!sessionId) {
    return res.status(400).json({ error: "Missing sessionId" });
  }

  try {
    info("artwork.generate.start", { sessionId });

    // 🧠 1️⃣ Retrieve prompt from temporary memory
    const artworkPrompt = await sessionCache.getTempPart(sessionId, "artworkPrompt");
    if (!artworkPrompt) throw new Error("No artwork prompt found in temporary memory");

    // 🧩 2️⃣ Generate image through existing OpenRouter route
    const response = await resilientRequest("artwork", artworkPrompt, {
      model: "google",
      type: "image",
      size: "1024x1024",
      response_format: "b64_json",
    });

    if (!response?.b64_json) throw new Error("No image data returned from Nano Banana");

    const buffer = Buffer.from(response.b64_json, "base64");

    // ☁️ 3️⃣ Upload to R2 (podcastart)
    const key = `${sessionId}.png`;
    await r2Put("art", key, buffer, { contentType: "image/png" });

    // 🧾 4️⃣ Log summary to console
    console.log("\n🎨 Artwork Generated via Nano Banana:");
    console.table({
      sessionId,
      bucket: "podcastart",
      file: key,
      sizeKB: (buffer.length / 1024).toFixed(1),
    });

    info("artwork.generate.success", { sessionId, bytes: buffer.length });
    return res.json({ success: true, key, bytes: buffer.length });
  } catch (err) {
    error("artwork.generate.fail", { message: err.message, sessionId });
    return res.status(500).json({ error: err.message });
  }
});

export default router;
