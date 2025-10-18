import {s3, R2_BUCKETS, uploadBuffer, listKeys, getObjectAsText} from "../../shared/utils/r2-client.js";
// routes/createScript.js
import express from "express";
import fetch from "node-fetch";

const router = express.Router();

router.post("/", async (req, res) => {
  try {
    const { sessionId, date } = req.body;

    if (!sessionId || !date) {
      return res.status(400).json({ error: "sessionId and date are required" });
    }

    const payload = { sessionId, date };

    await fetch(process.env.HOOKDECK_INTRO_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    res.json({ status: "started", sessionId });
  } catch (error) {
    console.error("❌ Error in /create-script:", error);
    res.status(500).json({ error: "Failed to start script generation" });
  }
});

export default router;
