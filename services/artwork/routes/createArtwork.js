// services/artwork/routes/createArtwork.js
import express from "express";
import { putJson, getObject } from "../../shared/utils/r2-client.js";
import { info, error } from "#logger.js";

const router = express.Router();

router.post("/artwork/generate", async (req, res) => {
  try {
    const payload = req.body || {};
    const bucket = process.env.R2_BUCKET_ART || process.env.R2_BUCKET_META;
    const key = `artwork/requests/${Date.now()}.json`;
    await putJson(bucket, key, payload);
    info("🎨 Artwork request stored", { bucket, key });
    res.json({ ok: true, bucket, key });
  } catch (err) {
    error("💥 Artwork create failed", { error: err.message });
    res.status(500).json({ ok: false, error: err.message });
  }
});

export default router;
