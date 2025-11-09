// ============================================================
// 🎙 AI Podcast Pipeline — Unified Orchestrator
// ============================================================

import { log } from "#logger.js";
import { orchestrateScript } from "../script/index.js";
import { orchestrateTTS } from "../tts/utils/orchestrator.js";
import { createPodcastArtwork } from "../artwork/createPodcastArtwork.js";
import { uploadText } from "#shared/r2-client.js";

// ============================================================
// 🚀 Main Pipeline Entry Point
// ============================================================

export async function runPodcastPipeline(sessionId) {
  log.info({ sessionId }, "🎧 Starting AI Podcast Pipeline...");

  try {
    // 1️⃣ Generate Script (Intro, Main, Outro)
    log.info({ sessionId }, "🧩 Generating podcast script...");
    const script = await orchestrateScript(sessionId);
    log.info({ sessionId, length: script.fullText?.length }, "✅ Script complete.");

    // 2️⃣ Generate Artwork
    log.info({ sessionId }, "🎨 Creating podcast artwork...");
    const artwork = await createPodcastArtwork({
      sessionId,
      prompt: `Podcast cover for ${script.meta?.title || "AI Weekly"}`
    });
    log.info({ sessionId, artwork }, "✅ Artwork ready.");

    // 3️⃣ Run TTS (Intro/Main/Outro synthesis)
    log.info({ sessionId }, "🎙 Launching TTS pipeline...");
    const tts = await orchestrateTTS(sessionId);
    log.info({ sessionId, produced: tts.produced }, "✅ TTS complete.");

    // 4️⃣ Upload Transcript
    if (script.fullText) {
      await uploadText(
        "transcripts",
        `${sessionId}.txt`,
        script.fullText,
        "text/plain"
      );
      log.info({ sessionId }, "📤 Transcript uploaded to R2.");
    }

    // 5️⃣ Summary Metadata
    const summary = {
      sessionId,
      title: script.meta?.title || "AI Weekly",
      artworkUrl: artwork?.url,
      ttsProduced: tts?.produced || false,
      transcriptUrl: `https://pub-7a098297d4ef4011a01077c72929753c.r2.dev/${sessionId}.txt`,
      duration: tts?.duration || null,
      createdAt: new Date().toISOString()
    };

    await uploadText("podcast-meta", `${sessionId}.json`, JSON.stringify(summary), "application/json");
    log.info({ sessionId }, "✅ Metadata saved.");

    log.info({ sessionId }, "🏁 Podcast pipeline complete.");
    return summary;

  } catch (err) {
    log.error({ sessionId, error: err.message }, "💥 Podcast pipeline failed.");
    throw err;
  }
}

export default runPodcastPipeline;
