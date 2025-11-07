import { info, error } from "#logger.js";
import { orchestrateScript } from "../script/utils/orchestrator.js";
import { orchestrateTTS } from "../tts/utils/orchestrator.js";
import { generateArtwork } from "../artwork/routes/generateArtwork.js";

export async function runPodcastPipeline(session) {
  const sessionId = typeof session === "object" ? session.sessionId : session;
  info({ sessionId }, "🎙 Podcast pipeline started");

  try {
    await orchestrateScript(sessionId);
    await orchestrateTTS(sessionId);
    await generateArtwork(sessionId);

    info({ sessionId }, "✅ Podcast pipeline completed successfully");
    return { ok: true };
  } catch (err) {
    error({ sessionId, error: err.message }, "💥 Podcast pipeline failed");
    throw err;
  }
}

export default runPodcastPipeline;
