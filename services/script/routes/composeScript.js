// services/script/routes/compose.js

import express from "express";
import { composeScript } from "../utils/compose.js";

const router = express.Router();

router.post("/compose", async (req, res) => {
  const { sessionId, tone = "neutral" } = req.body;

  try {
    const meta = await composeScript(sessionId, tone);
    res.status(200).json({ status: "success", meta });
  } catch (err) {
    console.error("Compose failed:", err);
    res.status(500).json({ error: "Compose step failed" });
  }
});

export default router;
