// services/tts/routes/tts.js
// ============================================================
// 🔊 TTS Route (webhook-free)
// POST /tts  { sessionId?: string, voiceId?: string, text?: string }
// ============================================================

import express from "express";
import { info, error } from "#logger.js";

const router = express.Router();

async function resolveTTS() {
  const candidates = [
    { mod: "../index.js", fns: ["runTTS", "synthesize", "default"] },
    { mod: "../synthesize.js", fns: ["runTTS", "synthesize", "default"] },
    { mod: "../tts.js", fns: ["runTTS", "synthesize", "default"] },
  ];

  for (const c of candidates) {
    try {
      const m = await import(c.mod);
      for (const name of c.fns) {
        if (typeof m[name] === "function") return m[name];
      }
    } catch (_) {}
  }
  throw new Error("No TTS runner found (tried ../index.js, ../synthesize.js, ../tts.js)");
}

const ttsRouter = express.Router();
ttsRouter.post("/", async (req, res) => {
  const sessionId = req.body?.sessionId || `TT-${Date.now()}`;
  const voiceId   = req.body?.voiceId || null;
  const text      = req.body?.text || null;

  info("🔊 TTS request received", { sessionId, hasText: Boolean(text), voiceId });

  try {
    const run = await resolveTTS();
    const result = await run({ sessionId, voiceId, text });
    return res.json({ ok: true, sessionId, result });
  } catch (err) {
    error("💥 TTS synthesis failed", { sessionId, error: err.message });
    return res.status(500).json({ ok: false, sessionId, error: err.message });
  }
});

export default ttsRouter;
