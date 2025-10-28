// services/script/utils/orchestrator.js

import { generateIntro, generateMain, generateOutro, generateComposedEpisode } from './models.js';
import sessionCache from './sessionCache.js';

export async function runFullScriptPipeline(sessionId) {
  const intro = await generateIntro(sessionId);
  const main = await generateMain(sessionId);
  const outro = await generateOutro(sessionId);

  await sessionCache.set(sessionId, { intro, main, outro });

  const composed = await generateComposedEpisode(sessionId);
  return { composed };
}