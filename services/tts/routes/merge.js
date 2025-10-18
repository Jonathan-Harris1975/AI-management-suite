import {s3, R2_BUCKETS, uploadBuffer, listKeys, getObjectAsText} from "../../shared/utils/r2-client.js";
import express from "express";
import { log } from "../../../utils/logger.js";
import { mergeChunks } from "../utils/audio.js";
import { postWebhook } from "../utils/webhooks.js";

const router = express.Router();

router.post("/", async (req, res) => {
  const { sessionId } = req.body || {};
  if (!sessionId) return res.status(400).json({ error: "sessionId is required" });
  try {
    const result = await mergeChunks(sessionId);
    // Chain to edit
    await postWebhook("EDIT_WEBHOOK", { sessionId });
    res.json({ success: true, ...result });
  } catch (err) {
    log.error({ sessionId, err: err.message }, "merge failed");
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
