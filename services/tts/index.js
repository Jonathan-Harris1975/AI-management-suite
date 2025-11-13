// ============================================================
// 🧠 TTS Orchestration — Full Production Pipeline
// ============================================================
//
// ✅ Handles full flow: TTS → Merge → Edit → Podcast
// ✅ Uses Amazon Polly (Neural)
// ✅ Uses Cloudflare R2 for chunk + final uploads
// ✅ Bulletproof keep-alive across long processes
// ✅ Graceful shutdown and robust error handling
// ============================================================

import { info, error } from "#logger.js";
import { ttsProcessor } from "./utils/ttsProcessor.js";
import { mergeProcessor } from "./utils/mergeProcessor.js";
import { editingProcessor } from "./utils/editingProcessor.js";
import { podcastProcessor } from "./utils/podcastProcessor.js";
import { startKeepAlive, stopKeepAlive } from "../shared/utils/keepalive.js"; // ✅ FIXED path + quote

// ============================================================
// 🧩 Orchestrator
// ============================================================

export async function ttsOrchestrator(sessionId, chunkList) {
  const globalLabel = `TTS-Orchestration:${sessionId}`;
  startKeepAlive(globalLabel, 120000); // pulse every 2 minutes
  info("🎬 Orchestration begin (global keep-alive active)", { sessionId });

  try {
    // ---------------------------------------------------------------------
    // 1️⃣  TEXT TO SPEECH
    // ---------------------------------------------------------------------
    const ttsResults = await ttsProcessor(sessionId, chunkList);
    info("🎙️ TTS stage complete", { sessionId, chunks: ttsResults.length });

    // ---------------------------------------------------------------------
    // 2️⃣  MERGE AUDIO CHUNKS
    // ---------------------------------------------------------------------
    const merged = await mergeProcessor(sessionId, ttsResults);
    info("🎧 Merge stage complete", { sessionId, url: merged.url });

    // ---------------------------------------------------------------------
    // 3️⃣  APPLY EDITING FILTERS (mature/deep tone)
    // ---------------------------------------------------------------------
    const editedBuffer = await editingProcessor(sessionId, merged);
    info("🎚️ Editing stage complete", { sessionId, size: editedBuffer.length });

    // ---------------------------------------------------------------------
    // 4️⃣  FINAL PODCAST MIX (intro/outro, normalization)
    // ---------------------------------------------------------------------
    const finalBuffer = await podcastProcessor(sessionId, editedBuffer);
    info("✅ Podcast processing complete", { sessionId, bytes: finalBuffer.length });

    // ---------------------------------------------------------------------
    // 5️⃣  SUCCESS SUMMARY
    // ---------------------------------------------------------------------
    info("🎯 Full TTS pipeline completed successfully", { sessionId, status: "success" });

    return {
      sessionId,
      success: true,
      message: "Pipeline complete",
      stages: {
        tts: ttsResults.length,
        merged: merged.url,
        edited: `${editedBuffer.length} bytes`,
      },
    };
  } catch (err) {
    error("💥 TTS orchestration failed", { sessionId, err: err.message });
    return {
      sessionId,
      success: false,
      error: err.message,
    };
  } finally {
    stopKeepAlive(globalLabel);
    info("🌙 Global keep-alive stopped, orchestration complete.", { sessionId });
  }
}

// ============================================================
// 🚀 Entry Point (if executed directly)
// ============================================================

if (import.meta.url === `file://${process.argv[1]}`) {
  const sessionId = process.env.SESSION_ID || "local-test";
  const sampleChunks = [
    { url: "https://example.com/chunk-001.txt" },
    { url: "https://example.com/chunk-002.txt" },
  ];

  ttsOrchestrator(sessionId, sampleChunks)
    .then(() => {
      info("🧩 Local orchestration complete", { sessionId });
      process.exit(0);
    })
    .catch((err) => {
      error("💥 Local orchestration error", { sessionId, err: err.message });
      process.exit(1);
    });
}
export { ttsOrchestrator as orchestrateTTS };
