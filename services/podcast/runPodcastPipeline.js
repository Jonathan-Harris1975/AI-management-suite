// services/podcast/runPodcastPipeline.js
export async function runPodcastPipeline(sessionId) {
  log.info(`🎙️ Podcast pipeline starting for session: ${sessionId}`);

  if (!sessionId) throw new Error("sessionId is required");

  try {
    // 1️⃣ Run the script pipeline (intro → main → outro → compose)
    const script = await orchestrateEpisode();
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

    return { ok: true, sessionId, script, tts, art };
  } catch (err) {
    log.error("💥 Podcast pipeline failed", { error: err.message });
    throw err;
  }
}
