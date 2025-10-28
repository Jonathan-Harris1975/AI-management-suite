import { generateIntro, generateMain, generateOutro } from "./models.js";
import * as sessionCache from "./sessionCache.js";
import { generateComposedEpisode } from "./models.js";

export async function orchestrateEpisode(sessionId) {
  const intro = await generateIntro(sessionId);
  const main = await generateMain(sessionId);
  const outro = await generateOutro(sessionId);

  // Store each part individually
  await sessionCache.storeTempPart(sessionId, "intro", intro);
  await sessionCache.storeTempPart(sessionId, "main", main);
  await sessionCache.storeTempPart(sessionId, "outro", outro);

  const result = await generateComposedEpisode(sessionId);
  return result;
}