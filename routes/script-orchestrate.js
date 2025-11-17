import log from ;
// routes/script-orchestrate.js
import express from ;
import { info, error } from ;
// Import the orchestrator utility from the script service
import { orchestrateScript } from ;

const router = express.Router();

/**
 * POST /script/orchestrate
 * Body: { sessionId, date, ... }
 */
router.post(, async (req, res) => {
  const { sessionId, ...rest } = req.body || {};
  info(, { sessionId });

  try {
    const result = await orchestrateScript({
      sessionId,
      ...rest,
    });

    res.status(200).json({ ok: true, result });
  } catch (err) {
    error(, { sessionId, error: err?.message || String(err) });
    res.status(500).json({ ok: false, error: err?.message ||  });
  }
});

export default router;
