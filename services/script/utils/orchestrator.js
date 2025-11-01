// services/script/utils/orchestrator.js
import { generateIntro, generateMain, generateOutro, generateComposedEpisode } from "./models.js";
import * as sessionCache from "./sessionCache.js";
import { info, error as logError } from "#logger.js"; // ✅ rename to avoid collision

export async function orchestrateEpisode(sessionId) {
  try {
    info("🚀 Starting orchestration", { sessionId });

    const intro = await generateIntro(sessionId);
    const main = await generateMain(sessionId);
    const outro = await generateOutro(sessionId);

    await sessionCache.storeTempPart(sessionId, "intro", intro);
    await sessionCache.storeTempPart(sessionId, "main", main);
    await sessionCache.storeTempPart(sessionId, "outro", outro);

    const result = await generateComposedEpisode(sessionId);
    info("✅ Orchestration complete", { sessionId });

    return result;
  } catch (err) {
    // ✅ use renamed logger safely
    logError("💥 Orchestration failed", { sessionId, message: err.message, stack: err.stack });
    throw err;
  }
}
