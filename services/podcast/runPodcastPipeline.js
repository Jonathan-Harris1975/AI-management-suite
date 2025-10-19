// services/podcast/runPodcastPipeline.js
// ============================================================
// 🎙️ AI Podcast Suite — Unified Podcast Pipeline (fixed imports)
// ============================================================
// Runs the podcast pipeline sequentially:
// script → tts → artwork
// ============================================================

import { log } from "../../shared/logger.js";
import { orchestrateScript } from "../script/utils/orchestrator.js";
import { orchestrateTTS } from "../tts/utils/orchestrator.js";
import { generatePodcastArtwork } from "../artwork/utils/artwork.js";

export async function runPodcastPipeline({ sessionId }) {
  log.info(`🎙️ Podcast pipeline starting for session: ${sessionId}`);

  try {
    // 1️⃣ Run the script pipeline (intro → main → outro → compose)
    const script = await orchestrateScript(sessionId);
    log.info(`🧩 Script pipeline completed for ${sessionId}`);

    // 2️⃣ Run TTS synthesis
    const tts = await orchestrateTTS({
      sessionId,
      text: script.fullText || script.combinedText,
    });
    log.info(`🔊 TTS synthesis completed for ${sessionId}`);

    // 3️⃣ Generate podcast artwork
    const art = await generatePodcastArtwork(sessionId);
    log.info(`🎨 Artwork generation completed for ${sessionId}`);

    // ✅ Final output summary
    return {
      sessionId,
      script,
      tts,
      art,
      status: "complete",
    };
  } catch (err) {
    log.error({ sessionId, error: err.message }, "💥 Podcast pipeline failed");
    throw err;
  }
}

// 👇 Ensure both default and named exports
export default runPodcastPipeline;
