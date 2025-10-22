// services/script/routes/index.js
import { Router } from "express";
import { info, warn, error } from "#logger.js";
// Import the real orchestrator you have in the repo
import * as orchestrator from "../utils/orchestrator.js";

const router = Router();

/**
 * Small helper to pick an exported function safely without guessing the exact name.
 * Tries multiple conventional names, then reports what's actually exported.
 */
function pick(fnNames = []) {
  for (const name of fnNames) {
    const fn =
      orchestrator?.[name] ||
      orchestrator?.default?.[name] ||
      (typeof orchestrator?.default === "function" && name === "default" ? orchestrator.default : undefined);
    if (typeof fn === "function") return fn;
  }
  return null;
}

function listExports() {
  const keys = new Set([
    ...Object.keys(orchestrator || {}),
    ...Object.keys(orchestrator?.default || {}),
  ]);
  return [...keys].sort();
}

/** ---------------------------
 *  POST /script/orchestrate
 *  High-level end-to-end script orchestration
 * --------------------------- */
router.post("/orchestrate", async (req, res) => {
  const sessionId = req.body?.sessionId || req.query?.sessionId || "";
  info("🎬 Script orchestration start", { sessionId });

  // Try the most likely export names without guessing one specific one
  const orchestrate =
    pick(["orchestrate", "runOrchestrate", "run", "orchestrator", "handleOrchestrate", "default"]) ||
    null;

  if (!orchestrate) {
    const exportsNow = listExports();
    const msg = "No orchestrate handler exported from services/script/utils/orchestrator.js";
    error("💥 Script orchestration failed", { sessionId, error: msg, exports: exportsNow });
    return res.status(500).json({ ok: false, error: msg, exports: exportsNow });
  }

  try {
    const result = await orchestrate(req.body || {});
    return res.status(200).json({ ok: true, result });
  } catch (e) {
    error("💥 Script orchestration failed", { sessionId, error: e.message });
    return res.status(500).json({ ok: false, error: e.message });
  }
});

/** ---------------------------
 *  POST /script/:part  where :part ∈ { intro | main | outro | compose }
 *  Lower-level, single-step endpoints
 * --------------------------- */
router.post("/:part(intro|main|outro|compose)", async (req, res) => {
  const { part } = req.params;
  const payload = req.body || {};
  info(`📜 ${part} requested`, { sessionId: payload?.sessionId });

  // Map each part to the most plausible function names; pick what actually exists.
  const nameMap = {
    intro:    ["intro", "generateIntro", "createIntro", "handleIntro"],
    main:     ["main", "generateMain", "createMain", "handleMain", "body"],
    outro:    ["outro", "generateOutro", "createOutro", "handleOutro"],
    compose:  ["compose", "generateCompose", "createCompose", "handleCompose", "stitch"],
  };

  // Also support a generic entry point that accepts { part, ... }
  const generic = pick(["generatePart", "handlePart", "runPart", "step"]);

  let fn = pick(nameMap[part] || []);
  if (!fn && generic) {
    // Wrap generic as a function with (payload) signature
    fn = (data) => generic({ part, ...(data || {}) });
  }

  if (!fn) {
    const exportsNow = listExports();
    const msg = `No ${part} generator found`;
    error(`💥 ${part} failed`, { error: msg, exports: exportsNow });
    return res.status(500).json({ ok: false, error: msg, exports: exportsNow });
  }

  try {
    const result = await fn(payload);
    return res.status(200).json({ ok: true, result });
  } catch (e) {
    error(`💥 ${part} failed`, { error: e.message });
    return res.status(500).json({ ok: false, error: e.message });
  }
});

export default router;
