// services/podcast/runPodcastPipeline.js
import { log } from "#shared/logger.js";
import { processPodcastPipeline } from "../tts/utils/orchestrator.js";

export async function runPodcastPipeline(sessionId, text) {
  try {
    log.info("pipeline.start", { sessionId });
    const result = await processPodcastPipeline(sessionId, text);
    log.info("pipeline.complete", { success: true, sessionId });
    return result;
  } catch (err) {
    log.error("pipeline.failed", { sessionId, error: err.message });
    throw err;
  }
}

// (Optional) keep the old name as an alias if other code imports runPipeline
export { runPodcastPipeline as runPipeline };
