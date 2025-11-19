// services/script/routes/createScript.js

import express from 'express';
import crypto from 'crypto';
import { orchestrateEpisode } from '../utils/orchestrator.js';
import { error } from '#logger.js';

const router = express.Router();

router.post('/create-script', async (req, res) => {
  const sessionId = req.body?.sessionId || crypto.randomUUID();

  try {
    const result = await runFullScriptPipeline(sessionId);
    res.status(200).json({ success: true, sessionId, ...result });
  } catch (err) {
    error('❌ Pipeline failed', { error: err });
    res.status(500).json({ error: 'Script generation failed', details: err.message });
  }
});

export default router;
