// services/podcast/runPodcastPipeline.js
// ============================================================
// 🎙 AI Podcast Pipeline — Unified Orchestrator
// ============================================================

import { log } from "#logger.js";
import { orchestrateScript } from "../script/index.js"; // standardized import
import { orchestrateTTS } from "../tts/utils/orchestrator.js";
import { createPodcastArtwork } from "../artwork/createPodcastArtwork.js";
import { uploadText } from "#shared/r2-client.js";

export async function runPodcastPipeline(sessionId) {
  log.debug("🎧 Starting AI Podcast Pipeline...", { sessionId });

  try {
    // 1️⃣ Script
    const script = await orchestrateScript(sessionId);
    log.info(" 📝 Script ready", { sessionId, chunks: script?.chunks?.length });

    // 2️⃣ Artwork
    const artwork = await createPodcastArtwork({
      sessionId,
      prompt: `Podcast cover for ${script?.metadata?.title || "AI Weekly"}`,
    });
    log.info("🎨 Artwork ready", { sessionId });

    // 3️⃣ TTS
    const tts = await orchestrateTTS({ sessionId, chunkKeys: script.chunks });
    log.info( "🗣️🎙️ TTS complete", { sessionId });

    const summary = { sessionId, script, artwork, tts };
    await uploadText("podcast-meta", `${sessionId}.json`, JSON.stringify(summary), "application/json");
    log.info("💾 Metadata saved", { sessionId });

    log.info("🏁 Podcast pipeline complete", { sessionId });
    return summary;
  } catch (err) {
    log.error("💥 Podcast pipeline failed", { sessionId, error: err?.message });
    throw err;
  }
}

export default runPodcastPipeline;
