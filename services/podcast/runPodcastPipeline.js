// services/podcast/runPodcastPipeline.js
import { log } from "#logger.js";
import { orchestrateScript } from "../script/index.js";
import { orchestrateTTS } from "../tts/utils/orchestrator.js";
import { createPodcastArtwork } from "../artwork/createPodcastArtwork.js";
import cleanupSession from "../shared/utils/cleanupSession.js";
import runRssFeedCreator from "../rss-feed-podcast/index.js";

export async function runPodcastPipeline(sessionId) {
  log.info("api.podcast.start", { sessionId });

  try {
    // -----------------------------------------------------------
    // 🧠 1) SCRIPT GENERATION (CRITICAL FIX: Payload must be object)
    // -----------------------------------------------------------
    log.info("🧠 Orchestrate Script: start");

    const script = await orchestrateScript({
      sessionId,
      date: new Date().toISOString(),
      tone: "balanced",
      location: "London",
      weather: null,        // orchestrator fetches weather internally
      turingQuote: null,    // orchestrator fetches Turing quote internally
    });

    log.info("🧾 Script generation complete", {
      transcriptKey: script?.transcriptKey,
      metaKey: script?.metaKey,
    });

    // -----------------------------------------------------------
    // 🎨 2) ARTWORK GENERATION
    // -----------------------------------------------------------
    const artworkPrompt =
      script?.artworkPrompt || script?.metadata?.artworkPrompt || null;

    const artwork = await createPodcastArtwork({
      sessionId,
      prompt: artworkPrompt || undefined,
    });

    log.info("🎨 Artwork generation complete", { sessionId });

    // -----------------------------------------------------------
    // 🗣️ 3) TEXT-TO-SPEECH GENERATION
    // -----------------------------------------------------------
    const tts = await orchestrateTTS(sessionId);
    log.info("🗣️ TTS pipeline complete", { sessionId });

    // -----------------------------------------------------------
    // 📡 4) RSS FEED UPDATE
    // -----------------------------------------------------------
    try {
      log.info("📡 Updating podcast RSS feed...");
      await runRssFeedCreator();
      log.info("📡 Podcast RSS feed updated successfully");
    } catch (rssErr) {
      log.error("❌ RSS feed update failed", {
        sessionId,
        error: rssErr?.message,
      });
    }

    // -----------------------------------------------------------
    // 🧹 5) CLEANUP SESSION
    // -----------------------------------------------------------
    try {
      log.info("🧹 Cleaning up session artefacts from R2...");
      await cleanupSession(sessionId);
      log.info("🧹 Session cleanup complete");
    } catch (cleanupErr) {
      log.error("⚠️ Cleanup failed", {
        sessionId,
        error: cleanupErr?.message,
      });
    }

    // -----------------------------------------------------------
    // 🎉 DONE
    // -----------------------------------------------------------
    const summary = { sessionId, script, artwork, tts };
    log.info("🏁 Podcast pipeline complete", { sessionId });

    return summary;

  } catch (err) {
    log.error("💥 Podcast pipeline failed", {
      sessionId,
      error: err?.message,
      stack: err?.stack,
    });
    throw err;
  }
}

export default runPodcastPipeline;
