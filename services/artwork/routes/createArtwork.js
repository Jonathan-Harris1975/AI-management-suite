import { getObject, putJson } from "../../shared/utils/r2-client.js";
import express from "express";
import fetch from "node-fetch";

const router = express.Router();

// This route is optional, a POST alternative to health trigger
router.post("/", async (req, res) => {
  try {
    const { sessionId, metaUrls } = req.body;

    if (!sessionId) {
      return res.status(400).json({ error: "sessionId is required" });
    }

    const payload = { sessionId, metaUrls };

    if (!process.env.ART_CREATE) {
      return res.status(500).json({ error: "ART_CREATE env not set" });
    }

    await fetch(process.env.ART_CREATE, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    res.json({ status: "started", sessionId });
  } catch (err) {
    console.error("❌ Error in /create-artwork:", err);
    res.status(500).json({ error: "Failed to start artwork generation" });
  }
});

export default router;
