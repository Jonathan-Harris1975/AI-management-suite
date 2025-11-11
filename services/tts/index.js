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
  info({ sessionId }, "🎬 Orchestration begin (global keep-alive active)");

  try {
    // ---------------------------------------------------------------------
    // 1️⃣  TEXT TO SPEECH
    // ---------------------------------------------------------------------
    const ttsResults = await ttsProcessor(sessionId, chunkList);
    info({ sessionId, chunks: ttsResults.length }, "🎙️ TTS stage complete");

    // ---------------------------------------------------------------------
    // 2️⃣  MERGE AUDIO CHUNKS
    // ---------------------------------------------------------------------
    const merged = await mergeProcessor(sessionId, ttsResults);
    info({ sessionId, url: merged.url }, "🎧 Merge stage complete");

    // ---------------------------------------------------------------------
    // 3️⃣  APPLY EDITING FILTERS (mature/deep tone)
    // ---------------------------------------------------------------------
    const editedBuffer = await editingProcessor(sessionId, merged);
    info({ sessionId, size: editedBuffer.length }, "🎚️ Editing stage complete");

    // ---------------------------------------------------------------------
    // 4️⃣  FINAL PODCAST MIX (intro/outro, normalization)
    // ---------------------------------------------------------------------
    const finalBuffer = await podcastProcessor(sessionId, editedBuffer);
    info({ sessionId, bytes: finalBuffer.length }, "✅ Podcast processing complete");

    // ---------------------------------------------------------------------
    // 5️⃣  SUCCESS SUMMARY
    // ---------------------------------------------------------------------
    info(
      { sessionId, status: "success" },
      "🎯 Full TTS pipeline completed successfully"
    );

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
    error({ sessionId, err: err.message }, "💥 TTS orchestration failed");
    return {
      sessionId,
      success: false,
      error: err.message,
    };
  } finally {
    stopKeepAlive(globalLabel);
    info({ sessionId }, "🌙 Global keep-alive stopped, orchestration complete.");
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
      info({ sessionId }, "🧩 Local orchestration complete");
      process.exit(0);
    })
    .catch((err) => {
      error({ sessionId, err: err.message }, "💥 Local orchestration error");
      process.exit(1);
    });
}
