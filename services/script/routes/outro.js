import {s3, R2_BUCKETS, uploadBuffer, listKeys, getObjectAsText} from "#shared/r2-client.js";
// routes/outro.js
import express from 'express';
import fs from 'fs';
import path from 'path';
import { resilientRequest } from "#shared/ai-service.js";
import { getOutroPromptFull } from '../utils/promptTemplates.js';
import { storeAndTrigger } from '../utils/script-helper.js';

const router = express.Router();

router.post('/', async (req, res) => {
  try {
    const { sessionId, date } = req.body;

    if (!sessionId || !date) {
      return res.status(400).json({ error: 'sessionId and date are required' });
    }

    // Build outro prompt
    const fullPrompt = await getOutroPromptFull();

    // Generate outro text
    const outroText = await resilientRequest('outro', [
      { role: 'user', content: fullPrompt }
    ]);

    // Save to persistent disk
    const storageDir = path.resolve('/mnt/data', sessionId);
    fs.mkdirSync(storageDir, { recursive: true });
    const outroPath = path.join(storageDir, 'outro.txt');
    fs.writeFileSync(outroPath, outroText, 'utf-8');

    // Store metadata + trigger compose via Hookdeck
    await storeAndTrigger({
      sessionId,
      step: 'outro',
      payload: { date, outroPath } }
    });

    res.json({
      status: 'outro complete',
      sessionId,
      outroPath,
      outro: outroText
    });
  } catch (err) {
    console.error('Outro error:', err);
    res.status(500).json({ error: 'Internal server error', details: err.message });
  }
});

export default router;
