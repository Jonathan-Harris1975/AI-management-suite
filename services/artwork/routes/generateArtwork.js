import {s3, R2_BUCKETS, uploadBuffer, listKeys, getObjectAsText} from "../../shared/utils/r2-client.js";
// routes/generateArtwork.js
import express from "express";
import fetch from "node-fetch";
import { generateArtwork } from "../utils/artwork.js";
import { uploadToR2 } from "../utils/r2-artwork-client.js";

const router = express.Router();

router.post("/", async (req, res) => {
  try {
    const { sessionId, prompt, metaUrls } = req.body;

    if (!sessionId) {
      return res.status(400).json({ error: "Missing sessionId" });
    }

    let finalPrompt = prompt;

    // Fetch prompt from R2 if not passed directly
    if (!finalPrompt && metaUrls?.artworkPrompt) {
      console.log(`📥 Fetching artwork prompt from: ${metaUrls.artworkPrompt}`);
      const resp = await fetch(metaUrls.artworkPrompt);
      if (!resp.ok) throw new Error(`Failed to fetch prompt: ${resp.status}`);
      finalPrompt = await resp.text();
    }

    if (!finalPrompt || finalPrompt.trim().length === 0) {
      return res.status(400).json({ error: "No artwork prompt available" });
    }

    console.log(`🎨 Generating artwork for sessionId=${sessionId}`);

    // Generate artwork (base64 PNG)
    const imageBase64 = await generateArtwork(finalPrompt);

    // Upload to R2
    const filename = `${sessionId}.png`;
    const artworkUrl = await uploadToR2(imageBase64, filename);

    console.log(`✅ Artwork uploaded: ${artworkUrl}`);

    res.json({ success: true, sessionId, artworkUrl, prompt: finalPrompt });
  } catch (err) {
    console.error("❌ Generate error:", err);
    res.status(500).json({ error: "Artwork generation failed", details: err.message });
  }
});

export default router;
