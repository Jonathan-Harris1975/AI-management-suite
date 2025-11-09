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
  log.info({ sessionId }, "🎧 Starting AI Podcast Pipeline...");

  try {
    // 1️⃣ Script
    const script = await orchestrateScript(sessionId);
    log.info({ sessionId, chunks: script?.chunks?.length }, "🧩 Script ready");

    // 2️⃣ Artwork
    const artwork = await createPodcastArtwork({
      sessionId,
      prompt: `Podcast cover for ${script?.metadata?.title || "AI Weekly"}`,
    });
    log.info({ sessionId }, "🎨 Artwork ready");

    // 3️⃣ TTS
    const tts = await orchestrateTTS({ sessionId, chunkKeys: script.chunks });
    log.info({ sessionId }, "🔊 TTS complete");

    const summary = { sessionId, script, artwork, tts };
    await uploadText("podcast-meta", `${sessionId}.json`, JSON.stringify(summary), "application/json");
    log.info({ sessionId }, "✅ Metadata saved");

    log.info({ sessionId }, "🏁 Podcast pipeline complete");
    return summary;
  } catch (err) {
    log.error({ sessionId, error: err?.message }, "💥 Podcast pipeline failed");
    throw err;
  }
}

export default runPodcastPipeline;
