import { generateIntro, generateMain, generateOutro, generateComposedEpisode } from "./models.js";
import * as sessionCache from "./sessionCache.js";
import { logger } from "#logger.js";

export async function orchestrateEpisode(sessionId) {
  try {
    logger.info("🚀 Starting orchestration", { sessionId });

    const intro = await generateIntro(sessionId);
    const main = await generateMain(sessionId);
    const outro = await generateOutro(sessionId);

    await sessionCache.storeTempPart(sessionId, "intro", intro);
    await sessionCache.storeTempPart(sessionId, "main", main);
    await sessionCache.storeTempPart(sessionId, "outro", outro);

    const result = await generateComposedEpisode(sessionId);
    logger.info("✅ Orchestration complete", { sessionId });

    return result;
  } catch (error) {
    logger.error("💥 Orchestration failed", { sessionId, error });
    throw error;
  }
}
