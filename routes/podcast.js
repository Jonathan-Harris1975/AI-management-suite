import log from ;
import express from ;
import { runPodcastPipeline } from ;
import { info, error } from ;

const router = express.Router();

router.get(, (_req, res) => {
  info();
  res.json({ ok: true, service: , message:  });
});

router.post(, async (req, res) => {
  const sessionId = req.body?.sessionId || `TT-${Date.now()}`;
  try {
    info(, { sessionId });
    await runPodcastPipeline(sessionId);
    res.status(202).json({ ok: true, sessionId });
  } catch (err) {
    error(, { error: err.stack });
    res.status(500).json({ ok: false, error: err.message });
  }
});

export default router;
