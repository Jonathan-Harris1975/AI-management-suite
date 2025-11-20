// services/podcast/runPodcastPipeline.js
// ============================================================
// 🎙 AI Podcast Pipeline — Unified Orchestrator
// ============================================================
//
// Flow:
//   1) Script generation
//   2) Artwork creation
//   3) TTS pipeline (handles all audio + final meta edits)
//   4) Podcast RSS feed regeneration
//   5) R2 session cleanup (edited, rawtext, merged, chunks)
//   6) Temp memory cleanup (GC if available)
// ============================================================

import { log } from "#logger.js";
import { orchestrateScript } from "../script/index.js";
import { orchestrateTTS } from "../tts/utils/orchestrator.js";
import runRssFeedCreator from "../rss-feed-podcast/index.js";
import { cleanupSession } from "../shared/utils/cleanupSession.js";

export async function runPodcastPipeline(sessionId) {
  log.debug("🎧 Starting AI Podcast Pipeline...", { sessionId });

  let script = null;
  let artwork = null;
  let tts = null;

  try {
    // 1️⃣ Script generation (intro / main / outro / base meta)
    script = await orchestrateScript(sessionId);
    log.info("🧾 Script generation complete", { sessionId });

    // 2️⃣ Artwork generation (episode cover art)
    artwork = await createPodcastArtworkSafe(sessionId);
    log.info("🎨 Artwork generation complete", { sessionId });

    // 3️⃣ TTS end-to-end
    //    TTS is responsible for:
    //    - generating audio
    //    - running editing/merge/processing
    //    - uploading final MP3 to R2 "podcast" bucket
    //    - updating meta JSON with URLs, duration, fileSize, etc.
    tts = await orchestrateTTS(sessionId);
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
  } finally {
    // Clear strong references before GC
    script = null;
    artwork = null;
    tts = null;

    // 6️⃣ R2 session cleanup
    try {
      await cleanupSession(sessionId);
    } catch (cleanupErr) {
      log.warn("⚠️ R2 cleanup failed", {
        sessionId,
        error: cleanupErr?.message,
      });
    }

    // 7️⃣ Optional GC (only if Node was started with --expose-gc)
    try {
      if (global && typeof global.gc === "function") {
        global.gc();
        log.debug("🧠 Forced GC after podcast pipeline", { sessionId });
      }
    } catch (gcErr) {
      log.debug("⚠️ GC not available or failed", {
        sessionId,
        error: gcErr?.message,
      });
    }
  }
}

export default runPodcastPipeline;

// ------------------------------------------------------------
// 🎨 Safe wrapper for artwork to avoid blowing up the pipeline
// ------------------------------------------------------------
import { createPodcastArtwork } from "../artwork/createPodcastArtwork.js";

async function createPodcastArtworkSafe(sessionId) {
  try {
    return await createPodcastArtwork(sessionId);
  } catch (err) {
    log.warn("⚠️ Artwork generation failed (non-fatal)", {
      sessionId,
      error: err?.message,
    });
    return null;
  }
}
