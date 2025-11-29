// services/podcast/runPodcastPipeline.js
// ============================================================
// 🎙 AI Podcast Pipeline — Unified Orchestrator
// ============================================================

import { log } from "#logger.js";
import { orchestrateScript } from "../script/index.js";
import { orchestrateTTS } from "../tts/utils/orchestrator.js";
import { createPodcastArtwork } from "../artwork/createPodcastArtwork.js";
import cleanupSession from "../shared/utils/cleanupSession.js";
import runRssFeedCreator from "../rss-feed-podcast/index.js";

export async function runPodcastPipeline(sessionId) {
  log.debug("🎧 Starting AI Podcast Pipeline...", { sessionId });

  try {
    // 1️⃣ Script generation
    const script = await orchestrateScript(sessionId);
    log.info("🧾 Script generation complete", { sessionId });

    // 2️⃣ Artwork generation WITH the artworkPrompt from meta
    const artwork = await createPodcastArtwork({
      sessionId,
      prompt: script?.meta?.artworkPrompt,
    });
    log.info("🎨 Artwork generation complete", { sessionId });

    // 3️⃣ TTS processing
    const tts = await orchestrateTTS(sessionId);
    log.info("🗣️ TTS pipeline complete", { sessionId });

    // 4️⃣ RSS regeneration (non-fatal)
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

    // 5️⃣ Cleanup (non-fatal)
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

    // Final return
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
