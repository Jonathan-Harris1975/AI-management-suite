// routes/script-orchestrate.js
import express from "express";
import { info, error } from "#logger.js";
// Import the orchestrator utility from the script service
import { orchestrateScript } from "../services/script/utils/orchestrator.js";

const router = express.Router();

/**
 * POST /script/orchestrate
 * Body: { sessionId, date, ... }
 */
router.post("/script/orchestrate", async (req, res) => {
  const { sessionId, ...rest } = req.body || {};
  info("🎬 Script orchestration start", { sessionId });

  try {
    const result = await orchestrateScript({
      sessionId,
      ...rest,
    });

    res.status(200).json({ ok: true, result });
  } catch (err) {
    error("💥 Script orchestration failed", { sessionId, error: err?.message || String(err) });
    res.status(500).json({ ok: false, error: err?.message || "orchestration failed" });
  }
});

export default router;
