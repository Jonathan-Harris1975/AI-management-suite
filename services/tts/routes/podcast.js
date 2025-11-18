import logger from "../../service-logger.js";
const { info, warn, error, debug } = logger;
import {s3, R2_R2_BUCKETS, uploadBuffer, listKeys, getObjectAsText} from "../../shared/utils/r2-client.js";
import express from "express";

const router = express.Router();

router.post("/", async (req, res) => {
  const { sessionId } = req.body || {};
  if (!sessionId) return res.status(400).json({ error: "sessionId is required" });
  log.info("📣 podcast final ack", { sessionId });
  res.json({ success: true, sessionId });
});

export default router;
