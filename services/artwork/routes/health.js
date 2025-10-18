import {s3, R2_BUCKETS, uploadBuffer, listKeys, getObjectAsText} from "#shared/r2-client.js";
// routes/health.js
import express from "express";
import fetch from "node-fetch";

const router = express.Router();

// ✅ GET /health
router.get("/", async (req, res) => {
  try {
    const { sessionId, metaUrls } = req.query;

    // If downstream just pings with no params → reply OK
    if (!sessionId) {
      return res.json({ status: "ok", message: "Health check passed" });
    }

    if (!process.env.ART_CREATE) {
      return res.status(500).json({ error: "ART_CREATE env not set" });
    }

    const payload = { sessionId, metaUrls };

    await fetch(process.env.ART_CREATE, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    res.json({ status: "started", sessionId });
  } catch (err) {
    console.error("❌ Health trigger error:", err);
    res.status(500).json({ error: "Failed to trigger artwork generation" });
  }
});

export default router;
