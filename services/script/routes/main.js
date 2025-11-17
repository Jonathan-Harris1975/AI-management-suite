import scriptLogger from "../utils/script-logger.js";
const { info, warn, error, debug } = scriptLogger;
import express from "express";
const router = express.Router();

async function resolveMain() {
  const candidates = [
    { mod: "../index.js", fns: ["generateMain", "main", "default"] },
    { mod: "../main.js", fns: ["generateMain", "main", "default"] },
  ];
  for (const c of candidates) {
    try {
      const m = await import(c.mod);
      for (const name of c.fns) if (typeof m[name] === "function") return m[name];
    } catch (_) {}
  }
  throw new Error("No main generator found");
}

router.post("/", async (req, res) => {
  const sessionId = req.body?.sessionId || `TT-${Date.now()}`;
  info("📜 Main requested", { sessionId });
  try {
    const run = await resolveMain();
    const result = await run({ sessionId, ...req.body });
    res.json({ ok: true, sessionId, result });
  } catch (err) {
    error("💥 Main failed", { sessionId, error: err.message });
    res.status(500).json({ ok: false, sessionId, error: err.message });
  }
});

export default router;
