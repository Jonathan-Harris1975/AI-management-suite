import express from "express";
import log from "../utils/root-logger.js";
import { orchestrateScript } from "../services/script/utils/orchestrator.js";

const router = express.Router();

router.post("/script/orchestrate", async (req, res) => {
  const { sessionId, ...rest } = req.body || {};
  log.info("🎬 script.orchestrate.start", { sessionId });

  try {
    const result = await orchestrateScript({
      sessionId,
      ...rest,
    });

    res.status(200).json({ ok: true, result });
  } catch (err) {
    log.error("💥 script.orchestrate.failed", {
      sessionId,
      error: err?.message || String(err),
    });
    res.status(500).json({ ok: false, error: err?.message || "orchestration failed" });
  }
});

export default router;
