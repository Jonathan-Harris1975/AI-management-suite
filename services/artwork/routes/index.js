import {s3, R2_BUCKETS, uploadBuffer, listKeys, getObjectAsText} from "../../shared/utils/r2-client.js";

// apps/artwork/routes/index.js
import express from "express";
import { createArtwork } from "../services/createArtwork.js";
import { withRetry } from "../../../utils/retry.js";
import { log } from "../../../utils/logger.js";

const router = express.Router();

router.post("/artwork", async (req, res) => {
  try {
    const result = await withRetry(
      () => createArtwork(req.body),
      { retries: 3, delay: 2000, label: "🎨 Artwork generation" }
    );
    return res.json({ success: true, result });
  } catch (err) {
    log.error({ err }, "❌ Artwork generation failed after retries");
    return res.status(500).json({ error: "Artwork generation failed" });
  }
});

export default router;
