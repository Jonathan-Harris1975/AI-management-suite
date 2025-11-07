// services/podcast/runPodcastPipeline.js
// ============================================================
// 🎙️ AI Podcast Suite — Unified Podcast Pipeline
// ============================================================
// Runs the podcast pipeline sequentially:
// script → tts → artwork
// ============================================================

import { info, error } from "#logger.js";
import { orchestrateEpisode } from "../script/utils/orchestrator.js";
import { orchestrateTTS } from "../tts/utils/orchestrator.js";
import { generatePodcastArtwork } from "../artwork/utils/artwork.js";

export async function runPodcastPipeline(sessionId) {
  info(`🎙️ Podcast pipeline starting for session: ${sessionId}`);

  if (!sessionId) throw new Error("sessionId is required");

  try {
    // 1️⃣ Run the script pipeline (intro → main → outro → compose)
    const script = await orchestrateEpisode();
    info(`🧩 Script pipeline completed for ${sessionId}`);

    // 2️⃣ Run TTS synthesis
    const tts = await orchestrateTTS({
      sessionId,
      text: script.fullText || script.combinedText,
    });
    info(`🔊 TTS synthesis completed for ${sessionId}`);

    // 3️⃣ Generate podcast artwork
    const art = await generatePodcastArtwork(sessionId);
    info(`🎨 Artwork generation completed for ${sessionId}`);

    info(`✅ Podcast pipeline complete for ${sessionId}`);
    return { ok: true, sessionId, script, tts, art };
  } catch (err) {
    error("💥 Podcast pipeline failed", { error: err.message });
    throw err;
  }
}
