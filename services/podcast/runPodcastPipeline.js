// services/podcast/runPodcastPipeline.js
// ============================================================
// 🎙 AI Podcast Pipeline — Unified Orchestrator
// ============================================================

import { log } from "#logger.js";
import { orchestrateScript } from "../script/index.js";
import { orchestrateTTS } from "../tts/utils/orchestrator.js";
import { createPodcastArtwork } from "../artwork/createPodcastArtwork.js";
import runRssFeedCreator from "../rss-feed-podcast/index.js";

export async function runPodcastPipeline(sessionId) {
  log.debug("🎧 Starting AI Podcast Pipeline...", { sessionId });

  try {
    // 1️⃣ Script generation (intro / main / outro / meta upstream)
    const script = await orchestrateScript(sessionId);
    log.info("🧾 Script generation complete", { sessionId });

    // 2️⃣ Artwork generation (cover art for this episode)
    const artwork = await createPodcastArtwork({ sessionId });
    log.info("🎨 Artwork generation complete", { sessionId });

    // 3️⃣ TTS end-to-end
    //    TTS service is responsible for:
    //    - generating audio
    //    - running editing/merge pipeline
    //    - uploading final MP3 to R2 (podcast bucket)
    //    - updating the meta JSON with URLs, duration, fileSize, etc.
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

    // 5️⃣ Final summary returned to caller (Make.com, route, etc.)
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
