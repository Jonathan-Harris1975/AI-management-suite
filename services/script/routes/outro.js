import express from "express";
import { info, error } from "#logger.js";

const router = express.Router();

async function resolveOutro() {
  const candidates = [
    { mod: "../index.js", fns: ["generateOutro", "outro", "default"] },
    { mod: "../outro.js", fns: ["generateOutro", "outro", "default"] },
  ];
  for (const c of candidates) {
    try {
      const m = await import(c.mod);
      for (const name of c.fns) if (typeof m[name] === "function") return m[name];
    } catch (_) {}
  }
  throw new Error("No outro generator found");
}

router.post("/", async (req, res) => {
  const sessionId = req.body?.sessionId || `TT-${Date.now()}`;
  info("📜 Outro requested", { sessionId });
  try {
    const run = await resolveOutro();
    const result = await run({ sessionId, ...req.body });
    res.json({ ok: true, sessionId, result });
  } catch (err) {
    error("💥 Outro failed", { sessionId, error: err.message });
    res.status(500).json({ ok: false, sessionId, error: err.message });
  }
});

export default router;
