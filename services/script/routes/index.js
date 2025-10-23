// services/script/routes/index.js
// Mounts intro, main, outro, compose, and exposes /orchestrate via orchestrator util.

import express from "express";
import { info } from "#logger.js";

// Child route modules — each exports an Express.Router()
// with its own POST "/" handler (NOT /script/*).
import intro from "./intro.js";
import main from "./main.js";
import outro from "./outro.js";
import compose from "./compose.js";

// Orchestrator utility (calls local endpoints via APP_URL)
import { orchestrateScript } from "../utils/orchestrator.js";

const router = express.Router();

// Optional: quick health for the script service itself
router.get("/health", (_req, res) => {
  res.json({ ok: true, service: "script", ts: new Date().toISOString() });
});

// Mount the 4 stage routers at their stage paths
router.use("/intro", intro);
router.use("/main", main);
router.use("/outro", outro);
router.use("/compose", compose);

// Orchestrate the full flow
router.post("/orchestrate", async (req, res) => {
  const { sessionId, date, topic, tone, seedText } = req.body || {};
  info("🎬 Script orchestration start", { sessionId });

  try {
    const result = await orchestrateScript({ sessionId, date, topic, tone, seedText });
    return res.json({ ok: true, ...result });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err?.message || String(err) });
  }
});

export default router;
