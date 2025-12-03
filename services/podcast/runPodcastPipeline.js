// services/podcast/runPodcastPipeline.js
// ============================================================
// 🎙 FULL PODCAST PIPELINE – FINAL STABLE VERSION
// ============================================================
// Features:
//   • Clean script orchestration with correct payload
//   • ChatGPT-only editorial pass (external config)
//   • Correct episode counter in metasystem bucket
//   • Artwork pipeline with prompt fallback
//   • Stable TTS pipeline
//   • Clean + validated RSS feed update
//   • R2 session cleanup for artefacts
//   • Memory cleanup (no R2 deletions)
//   • Fully isolated stateless runs
// ============================================================

import { log } from "#logger.js";
import { orchestrateScript } from "../script/index.js";
import { orchestrateTTS } from "../tts/utils/orchestrator.js";
import { createPodcastArtwork } from "../artwork/createPodcastArtwork.js";

import cleanupSession from "../shared/utils/cleanupSession.js";
import finalCleanupSession from "../shared/utils/cleanupSessionFinal.js";
import cleanupTempMemory from "../shared/utils/cleanupTempMemory.js";

import runRssFeedCreator from "../rss-feed-podcast/index.js";

export async function runPodcastPipeline(sessionId) {
  log.info("api.podcast.start", { sessionId });

  try {
    // -----------------------------------------------------------
    // 🧠 1) SCRIPT GENERATION
    // -----------------------------------------------------------
    log.info("🧠 Orchestrating script generation…");

    const script = await orchestrateScript({
      sessionId,
      date: new Date().toISOString(),
      tone: "balanced",
      location: "London",

      // fetched internally by orchestrator
      weather: null,
      turingQuote: null,
    });

    log.info("🧾 Script generation complete", {
      transcriptKey: script?.transcriptKey,
      metaKey: script?.metaKey,
      artworkPrompt: script?.artworkPrompt,
    });

    // -----------------------------------------------------------
    // 🎨 2) ARTWORK GENERATION
    // -----------------------------------------------------------
    const artworkPrompt =
      script?.artworkPrompt ||
      script?.metadata?.artworkPrompt ||
      undefined;

    const artwork = await createPodcastArtwork({
      sessionId,
      prompt: artworkPrompt,
    });

    log.info("🎨 Artwork complete", {
      sessionId,
      artUrl: artwork?.url || null,
    });

    // -----------------------------------------------------------
    // 🗣️ 3) TTS PIPELINE
    // -----------------------------------------------------------
    log.info("🗣️ TTS pipeline starting…");
    const tts = await orchestrateTTS(sessionId);
    log.info("🗣️ TTS pipeline complete", { sessionId });

    // -----------------------------------------------------------
    // 📡 4) RSS FEED UPDATE
    // -----------------------------------------------------------
    log.info("📡 Updating RSS feed…");

    try {
      await runRssFeedCreator();
      log.info("📡 RSS feed updated successfully");
    } catch (rssErr) {
      log.error("❌ RSS feed update failed", {
        sessionId,
        error: rssErr?.message,
      });
    }

    // -----------------------------------------------------------
    // 🧹 5) CLEANUP R2 SESSION (artefacts)
    // -----------------------------------------------------------
    try {
      log.info("🧹 Cleaning R2 artefacts…");
      await cleanupSession(sessionId);
      await finalCleanupSession(sessionId); // catches stray artefacts
      log.info("🧹 R2 cleanup complete");
    } catch (cleanupErr) {
      log.error("⚠️ R2 cleanup failed", {
        sessionId,
        error: cleanupErr?.message,
      });
    }

    // -----------------------------------------------------------
    // 🧽 6) MEMORY CLEANUP (in-process only)
    // -----------------------------------------------------------
    try {
      log.info("🧽 Clearing temporary memory…");
      await cleanupTempMemory(sessionId);
      log.info("🧽 Temporary memory cleared");
    } catch (memErr) {
      log.warn("⚠️ Memory cleanup failed", {
        sessionId,
        error: memErr?.message,
      });
    }

    // -----------------------------------------------------------
    // 🎉 DONE
    // -----------------------------------------------------------
    const summary = {
      sessionId,
      script,
      artwork,
      tts,
    };

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
