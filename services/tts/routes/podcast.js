import {s3, R2_BUCKETS, uploadBuffer, listKeys, getObjectAsText} from "../../shared/utils/r2-client.js";
import express from "express";
import { log } from "../../../utils/logger.js";

const router = express.Router();

router.post("/", async (req, res) => {
  const { sessionId } = req.body || {};
  if (!sessionId) return res.status(400).json({ error: "sessionId is required" });
  log.info({ sessionId }, "📣 podcast final ack");
  res.json({ success: true, sessionId });
});

export default router;
