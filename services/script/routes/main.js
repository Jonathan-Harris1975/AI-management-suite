import {s3, R2_BUCKETS, uploadBuffer, listKeys, getObjectAsText} from "../../shared/utils/r2-client.js";
// routes/main.js
import express from 'express';
import fs from 'fs';
import path from 'path';
import { resilientRequest } from '../utils/ai-service.js';
import { getMainPrompt } from '../utils/promptTemplates.js';
import fetchFeeds from '../utils/fetchFeeds.js';
import { storeAndTrigger } from '../utils/script-helper.js';

const router = express.Router();

router.post('/', async (req, res) => {
  try {
    const { sessionId, date } = req.body;

    if (!sessionId || !date) {
      return res.status(400).json({ error: 'sessionId and date are required' });
    }

    const feedUrl = process.env.FEED_URL;
    if (!feedUrl) {
      return res.status(500).json({ error: 'FEED_URL missing in environment' });
    }

    // Fetch articles
    const articles = await fetchFeeds(feedUrl);
    if (!articles || articles.length === 0) {
      return res.status(500).json({ error: 'No articles available from feed' });
    }

    const articleTexts = articles.map(a => a.contentSnippet || a.content || a.title);

    // Build main prompt (target 60 mins by default)
    const fullPrompt = getMainPrompt(articleTexts, 60);

    // Generate main script
    const mainText = await resilientRequest('main', [
      { role: 'user', content: fullPrompt }
    ]);

    // Save to persistent disk
    const storageDir = path.resolve('/mnt/data', sessionId);
    fs.mkdirSync(storageDir, { recursive: true });
    const mainPath = path.join(storageDir, 'main.txt');
    fs.writeFileSync(mainPath, mainText, 'utf-8');

    // Store metadata + trigger outro via Hookdeck
    await storeAndTrigger({
      sessionId,
      step: 'main',
      payload: { date, mainPath, articleCount: articleTexts.length },
      nextUrl: process.env.HOOKDECK_OUTRO_URL
    });

    res.json({
      status: 'main complete',
      sessionId,
      mainPath,
      main: mainText
    });
  } catch (err) {
    console.error('Main error:', err);
    res.status(500).json({ error: 'Internal server error', details: err.message });
  }
});

export default router;
