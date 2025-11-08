// ============================================================
// 🎙 AI Podcast Pipeline — Unified Orchestrator
// ============================================================

import { log } from "#logger.js";
import { orchestrateScript } from "../script/utils/orchestrator.js";
import { orchestrateTTS } from "../tts/utils/orchestrator.js";
import { createPodcastArtwork } from "../artwork/createPodcastArtwork.js";
import { uploadText } from "#shared/r2-client.js";

// ============================================================
// 🚀 Main Pipeline Entry Point
// ============================================================

export async function runPodcastPipeline(sessionId) {
  log.info({ sessionId }, "🎧 Starting AI Podcast Pipeline...");

  try {
    // ─────────────────────────────────────────────
    // 1️⃣ Generate the Script (Intro/Main/Outro)
    // ─────────────────────────────────────────────
    log.info({ sessionId }, "🧩 Generating podcast script...");
    const script = await orchestrateScript(sessionId);
    log.info({ sessionId, hasText: !!script.fullText, length: script.fullText?.length }, "🧠 Script composed summary");
    log.info({ sessionId }, "✅ Script generation complete.");

    // ─────────────────────────────────────────────
    // 2️⃣ Generate Artwork
    // ─────────────────────────────────────────────
    log.info({ sessionId }, "🎨 Generating podcast artwork...");
    const art = await createPodcastArtwork({ sessionId, prompt: `Podcast cover for ${sessionId} — ${script.meta?.title || 'AI Weekly'}` });
    log.info({ sessionId, art }, "✅ Artwork generated and uploaded.");

    // ─────────────────────────────────────────────
    // 3️⃣ Text-to-Speech Pipeline (Full Orchestrator)
    // ─────────────────────────────────────────────
    log.info({ sessionId }, "🎙 Launching TTS pipeline...");
    const ttsResult = await orchestrateTTS(sessionId);
    log.info({ sessionId, produced: ttsResult.produced }, "✅ TTS pipeline complete.");

    // ─────────────────────────────────────────────
    // 4️⃣ Save Metadata to R2
    // ─────────────────────────────────────────────
    const metadata = {
      sessionId,
      title: script.meta?.title || "Untitled Episode",
      artwork: artUrl,
      ttsChunks: ttsResult.produced,
      createdAt: new Date().toISOString(),
    };

    await uploadText("meta", `${sessionId}.meta.json`, JSON.stringify(metadata, null, 2), "application/json");
    log.info({ sessionId }, "💾 Metadata saved to R2.");

    // ─────────────────────────────────────────────
    // ✅ Done
    // ─────────────────────────────────────────────
    log.info({ sessionId }, "🎉 Podcast pipeline completed successfully.");
    return { ok: true, sessionId, metadata };
  } catch (err) {
    log.error({ sessionId, error: err.message }, "💥 Podcast pipeline failed");
    throw err;
  }
      }
