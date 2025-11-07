// services/podcast/runPodcastPipeline.js
// ============================================================
// 🎙️ AI Podcast Suite — Unified Podcast Pipeline (sessionId-based naming)
// ============================================================

import { info, error } from "#logger.js";
import { orchestrateEpisode } from "../script/utils/orchestrator.js";
import { orchestrateTTS } from "../tts/utils/orchestrator.js";
import { generatePodcastArtwork } from "../artwork/utils/artwork.js";
import { putObject } from "#shared/r2-client.js";

export async function runPodcastPipeline(sessionId) {
  info(`🎙️ Podcast pipeline starting for session: ${sessionId}`);

  if (!sessionId) throw new Error("sessionId is required");

  try {
    // 1️⃣ Run the script pipeline
    const script = await orchestrateEpisode();
    info(`🧩 Script pipeline completed for ${sessionId}`);

    // 2️⃣ Run TTS synthesis
    const tts = await orchestrateTTS({ sessionId });
    info(`🔊 TTS synthesis completed for ${sessionId}`);

    // 3️⃣ Generate artwork
    const art = await generatePodcastArtwork(sessionId);
    info(`🎨 Artwork generation completed for ${sessionId}`);

    // 4️⃣ Generate metadata JSON tied to sessionId
    const metadata = {
      sessionId,
      title: script?.meta?.title || `AI Weekly Episode`,
      date: new Date().toISOString(),
      type: "podcast",
      status: "complete",
    };

    const metaKey = `${sessionId}.meta.json`;
    await putObject(process.env.R2_META_BUCKET, metaKey, JSON.stringify(metadata));
    info(`🧾 Metadata stored as ${metaKey}`);

    info(`✅ Podcast pipeline complete for ${sessionId}`);
    return { ok: true, sessionId, script, tts, art };
  } catch (err) {
    error("💥 Podcast pipeline failed", { error: err.message });
    throw err;
  }
}
