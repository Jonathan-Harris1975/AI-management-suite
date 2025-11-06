import express from "express";
import { generateSpeech } from "../index.js";

const router = express.Router();

/**
 * POST /tts/generate
 * Body: { text: string, voice?: string }
 */
router.post("/generate", async (req, res) => {
  try {
    const { text, voice } = req.body;
    if (!text) return res.status(400).json({ error: "Missing 'text' field" });

    const path = await generateSpeech(text, { voice });
    res.json({ ok: true, path });
  } catch (err) {
    console.error("TTS generation failed:", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

export default router;
