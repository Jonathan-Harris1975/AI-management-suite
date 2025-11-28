// services/podcast/runPodcastPipeline.js

import { log } from "#logger.js";
import { orchestrateScript } from "../script/index.js";
import { orchestrateTTS } from "../tts/utils/orchestrator.js";
import { createPodcastArtwork } from "../artwork/createPodcastArtwork.js";
import cleanupSession from "../shared/utils/cleanupSession.js";
import runRssFeedCreator from "../rss-feed-podcast/index.js";

export async function runPodcastPipeline(sessionId) {
  log.debug("🎧 Starting AI Podcast Pipeline...", { sessionId });

  try {
    // 1️⃣ Script generation (intro / main / outro / meta upstream)
    const script = await orchestrateScript(sessionId);
    log.info("🧾 Script generation complete", { sessionId });

    // 2️⃣ Artwork generation with LLM artwork prompt if available
    const artworkPrompt =
      script?.artworkPrompt || script?.metadata?.artworkPrompt || null;

    const artwork = await createPodcastArtwork({
      sessionId,
      prompt: artworkPrompt || undefined,
    });
    log.info("🎨 Artwork generation complete", { sessionId });

    // 3️⃣ TTS end-to-end
    const tts = await orchestrateTTS(sessionId);
    log.info("🗣️ TTS pipeline complete", { sessionId });

    // 4️⃣ RSS feed regeneration (non-fatal if it fails)
    try {
      log.info("📡 Updating podcast RSS feed...", { sessionId });
      await runRssFeedCreator();
      log.info("📡 Podcast RSS feed updated successfully", { sessionId });
    } catch (rssErr) {
      log.error("❌ RSS feed update failed (non-fatal)", {
        sessionId,
        error: rssErr?.message,
      });
    }

    // 5️⃣ Session cleanup (non-fatal; runs after RSS update)
    try {
      log.info("🧹 Cleaning up session artefacts from R2...", { sessionId });
      await cleanupSession(sessionId);
      log.info("🧹 Session cleanup complete", { sessionId });
    } catch (cleanupErr) {
      log.error("⚠️ Session cleanup failed (non-fatal)", {
        sessionId,
        error: cleanupErr?.message,
      });
    }

    const summary = { sessionId, script, artwork, tts };

    log.info("🏁 Podcast pipeline complete", { sessionId });
    return summary;
  } catch (err) {
    log.error("💥 Podcast pipeline failed", {
      sessionId,
      error: err?.message,
    });
    throw err;
  }
}

export default runPodcastPipeline;
