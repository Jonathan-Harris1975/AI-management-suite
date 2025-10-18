import {s3, R2_BUCKETS, uploadBuffer, listKeys, getObjectAsText} from "#shared/r2-client.js";
// routes/compose.js
import express from 'express';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { resilientRequest } from "#shared/ai-service.js";
import splitPlainText from '../utils/splitPlainText.js';
import editAndFormat from '../utils/editAndFormat.js';
import uploadChunksToR2 from '../utils/uploadChunksToR2.js';
import uploadToR2 from '../utils/uploadToR2.js';
import compose from '../utils/compose.js';
import {
  getTitleDescriptionPrompt,
  getSEOKeywordsPrompt,
  getArtworkPrompt,
  extractAndParseJson,
} from '../utils/podcastHelpers.js';
import { getRandomTone } from '../utils/toneSetter.js';
import durationRotator from '../utils/durationRotator.js';
import { storeAndTrigger } from '../utils/script-helper.js';
import fetch from 'node-fetch';

async function askPodcastHelper(prompt) {
  return resilientRequest('podcastHelper', [{ role: 'user', content: prompt }]);
}

const EPISODE_FILE = path.resolve('/mnt/data', 'episodes.json');

function getNextEpisodeNumber() {
  let episodes = { lastEpisode: 0 };
  if (fs.existsSync(EPISODE_FILE)) {
    try {
      episodes = JSON.parse(fs.readFileSync(EPISODE_FILE, 'utf-8'));
    } catch {
      episodes = { lastEpisode: 0 };
    }
  }
  episodes.lastEpisode += 1;
  fs.writeFileSync(EPISODE_FILE, JSON.stringify(episodes), 'utf-8');
  return String(episodes.lastEpisode).padStart(2, '0');
}

const router = express.Router();

router.post('/', async (req, res) => {
  try {
    const { sessionId, targetDuration } = req.body;
    if (!sessionId) {
      return res.status(400).json({ error: 'Missing sessionId' });
    }

    const finalTargetDuration = targetDuration || durationRotator.getNextDuration();
    console.log(`🎯 Generating podcast with target duration: ${finalTargetDuration} minutes`);

    const storageDir = path.resolve('/mnt/data', sessionId);
    const introPath = path.join(storageDir, 'intro.txt');
    const outroPath = path.join(storageDir, 'outro.txt');
    const mainPath = path.join(storageDir, 'main.txt');

    if (!fs.existsSync(introPath) || !fs.existsSync(outroPath) || (!fs.existsSync(mainPath) && !fs.readdirSync(storageDir).some(f => /^chunk-\d+\.txt$/.test(f)))) {
      return res.status(404).json({ error: 'One or more transcript parts not found' });
    }

    const introText = fs.readFileSync(introPath, 'utf-8').trim();
    const outroText = fs.readFileSync(outroPath, 'utf-8').trim();

    // Assemble main from chunks if present
    let mainText;
    const chunkFiles = fs.readdirSync(storageDir).filter(f => /^chunk-\d+\.txt$/.test(f));
    if (chunkFiles.length > 0) {
      mainText = chunkFiles
        .sort((a, b) => parseInt(a.match(/\d+/)[0]) - parseInt(b.match(/\d+/)[0]))
        .map(f => fs.readFileSync(path.join(storageDir, f), 'utf-8').trim())
        .filter(Boolean)
        .join('\n\n');
      console.log(`Combined ${chunkFiles.length} chunk files`);
    } else {
      mainText = fs.readFileSync(mainPath, 'utf-8').trim();
      console.log('Using main.txt');
    }

    // Edit and format main to match target duration
    mainText = await editAndFormat(mainText, finalTargetDuration);
    if (!mainText || !mainText.trim()) {
      return res.status(400).json({ error: 'Main script is empty after formatting' });
    }

    // Full transcript and upload
    const fullTranscript = [introText, mainText, outroText].join('\n\n');
    const finalTranscriptPath = path.join(storageDir, 'final-full-transcript.txt');
    fs.writeFileSync(finalTranscriptPath, fullTranscript, 'utf-8');

    const transcriptUrl = await uploadToR2(finalTranscriptPath, `${sessionId}.txt`);

    // Upload chunks
    const chunks = splitPlainText(fullTranscript, 4500);
    const chunkUrls = [];
    for (let i = 0; i < chunks.length; i++) {
      const tempFilePath = path.join(os.tmpdir(), `upload-chunk-${sessionId}-${i + 1}.txt`);
      fs.writeFileSync(tempFilePath, chunks[i], 'utf-8');
      const key = `${sessionId}/chunk-${i + 1}.txt`;
      const url = await uploadChunksToR2(tempFilePath, key);
      fs.unlinkSync(tempFilePath);
      chunkUrls.push(url);
    }

    // Metadata via LLM
    const titleDescResponse = await askPodcastHelper(getTitleDescriptionPrompt(fullTranscript));
    const parsedData = extractAndParseJson(titleDescResponse);
    if (!parsedData?.title || !parsedData?.description) {
      return res.status(500).json({ error: 'Failed to parse AI title/description' });
    }

    const episodeNumber = getNextEpisodeNumber();
    const title = parsedData.title;
    const description = parsedData.description;
    const seoKeywords = (await askPodcastHelper(getSEOKeywordsPrompt(description)) || '').trim();
    const artworkPrompt = (await askPodcastHelper(getArtworkPrompt(description)) || '').trim();

    const tone = getRandomTone();
    const words = fullTranscript.split(/\s+/).length;
    const estimatedMinutes = Math.round((words / 155) * 10) / 10;

    // Delegate metadata uploads to util compose
    const { script, metaUrls } = await compose({
      intro: introText,
      main: mainText,
      outro: outroText,
      date: new Date().toISOString(),
      sessionId,
      title,
      description,
      seoKeywords,
      artworkPrompt
    });

    // Persist metadata locally and finish
    await storeAndTrigger({
      sessionId,
      step: 'compose',
      payload: {
        episodeNumber,
        transcriptUrl,
        chunkUrls,
        wordCount: words,
        estimatedMinutes,
        targetMinutes: finalTargetDuration,
        tone,
        metaUrls
      }
    });
    res.json({
      sessionId,
      episodeNumber,
      transcriptUrl,
      chunkUrls,
      chunks,
      fullTranscript: script,
      duration: {
        target: finalTargetDuration,
        estimated: estimatedMinutes,
        words,
        wordsPerMinute: 155,
        status: Math.abs(estimatedMinutes - finalTargetDuration) <= 10 ? 'on-target' : 'off-target'
      },
      podcast: { title, description, seoKeywords, artworkPrompt },
      tone,
      metaUrls
    });
  } catch (error) {
    console.error('Compose error:', error);
    res.status(500).json({ error: error.message || 'Server error' });
  }
});

export default router;
