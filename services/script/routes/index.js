// services/script/routes/index.js
import express from "express";
import { orchestrateScript } from "../utils/orchestrator.js";
import { info } from "#logger.js";

const router = express.Router();

router.post("/orchestrate", async (req, res) => {
  try {
    const sessionId = req.body.sessionId || `session-${Date.now()}`;
    info("🎬 Script orchestration start", { sessionId });

    const result = await orchestrateScript({ sessionId });
    return res.json({ ok: true, ...result });
  } catch (err) {
    console.error("❌ Orchestration error", err);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

export default router;
