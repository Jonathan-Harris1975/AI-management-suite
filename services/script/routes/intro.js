import {s3, R2_BUCKETS, uploadBuffer, listKeys, getObjectAsText} from "#shared/r2-client.js";
// routes/intro.js
import express from 'express';
import fs from 'fs';
import path from 'path';
import { resilientRequest } from "#shared/ai-service.js";
import { getIntroPrompt } from '../utils/promptTemplates.js';
import { storeAndTrigger } from '../utils/script-helper.js';

const router = express.Router();

router.post('/', async (req, res) => {
  try {
    const { sessionId, date, reset } = req.body;

    if (!sessionId || !date) {
      return res.status(400).json({ error: 'sessionId and date are required' });
    }

    // Reset session folder if requested
    if (reset && reset === 'Y') {
      const sessionDir = path.resolve('/mnt/data', sessionId);
      if (fs.existsSync(sessionDir)) {
        fs.rmSync(sessionDir, { recursive: true, force: true });
      }
    }

    // Build intro prompt
    const fullPrompt = getIntroPrompt({ date });

    // Generate intro text with AI
    const introText = await resilientRequest('intro', [
      { role: 'user', content: fullPrompt }
    ]);

    // Save to persistent disk
    const storageDir = path.resolve('/mnt/data', sessionId);
    fs.mkdirSync(storageDir, { recursive: true });
    const introPath = path.join(storageDir, 'intro.txt');
    fs.writeFileSync(introPath, introText, 'utf-8');

    // Store metadata + trigger main via Hookdeck
    await storeAndTrigger({
      sessionId,
      step: 'intro',
      payload: { date, introPath } }
    });

    res.json({
      status: 'intro complete',
      sessionId,
      introPath,
      intro: introText
    });
  } catch (err) {
    console.error('Intro error:', err);
    res.status(500).json({ error: 'Internal server error', details: err.message });
  }
});

export default router;
