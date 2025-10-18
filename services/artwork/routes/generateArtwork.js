// services/artwork/routes/generateArtwork.js
import express from "express";
import { putJson } from "../../shared/utils/r2-client.js";
import { info, error } from "../../shared/utils/logger.js";

const router = express.Router();

router.post("/artwork/generate", async (req, res) => {
  try {
    const { sessionId, prompt } = req.body || {};
    const bucket = process.env.R2_BUCKET_ART || process.env.R2_BUCKET_META;
    const key = `artwork/generated/${sessionId || Date.now()}.json`;
    await putJson(bucket, key, { sessionId, prompt, createdAt: new Date().toISOString() });
    info("🎨 Artwork generation queued", { bucket, key });
    res.json({ ok: true, bucket, key });
  } catch (err) {
    error("💥 Artwork generate failed", { error: err.message });
    res.status(500).json({ ok: false, error: err.message });
  }
});

export default router;
