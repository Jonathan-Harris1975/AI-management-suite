// services/artwork/routes/createArtwork.js (patched)
import express from "express";
import { putJson } from "#shared/r2-client.js";
import { info, error, debug } from "#logger.js";

const router = express.Router();

router.post("/", async (req, res) => {
  try {
    const payload = req.body || {};
    const bucket = process.env.R2_BUCKET_ART;
    if (!bucket) throw new Error("R2_BUCKET_ART not set");

    const key = `artwork/requests/${Date.now()}.json`;
    await putJson(bucket, key, payload);
    debug("artwork.create.stored", { bucket, key });

    res.json({ ok: true, bucket, key });
  } catch (err) {
    error("artwork.create.fail", { message: err.message });
    res.status(500).json({ ok: false, error: err.message });
  }
});

export default router;
