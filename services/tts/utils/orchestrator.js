// services/tts/utils/orchestrator.js
// ============================================================
// 🎙 AI Podcast Suite – TTS Orchestrator (Amazon Polly Edition)
// ============================================================
//
// ✅ Features
//  • Works with flat R2 layout (no nested folders)
//  • Builds public chunk URLs automatically
//  • Logs model + region info
//  • Keeps heartbeat alive for long processes
//  • Provides detailed success/error summaries
// ============================================================

import { info, error, warn } from "#logger.js";
import { startHeartbeat, stopHeartbeat } from "#shared/utils/heartbeat.js";
import { putJson } from "#shared/r2-client.js";
import { ttsProcessor } from "./ttsProcessor.js";

// ------------------------------------------------------------
// 🌍 Constants & Helpers
// ------------------------------------------------------------
const RAWTEXT_BASE =
  process.env.R2_PUBLIC_BASE_URL_RAW_TEXT ||
  "https://pub-7a098297d4ef4011a01077c72929753c.r2.dev";

const DEFAULT_VOICE = process.env.POLLY_VOICE_ID || "Brian";
const AWS_REGION = process.env.AWS_REGION || "eu-west-2";

// ------------------------------------------------------------
// 🧠 Main Orchestrator
// ------------------------------------------------------------
export async function orchestrateTTS(sessionId) {
  const sid = sessionId || `TT-${Date.now()}`;
  info({ service: "ai-podcast-suite", sessionId: sid }, "🎙 TTS Processor Start");

  // Start heartbeat
  const hb = startHeartbeat(`ttsProcessor:${sid}`);
  try {
    info(
      { sessionId: sid, model: "Amazon Polly", voice: DEFAULT_VOICE, region: AWS_REGION },
      "🧩 Using Amazon Polly (Neural) configuration"
    );

    // Build flat URL list for text chunks
    // Example: https://pub-xxx.r2.dev/TT-2025-11-10/chunk-001.txt
    const chunkUrls = [];
    for (let i = 1; i <= 50; i++) {
      const index = String(i).padStart(3, "0");
      const url = `${RAWTEXT_BASE}/${sid}/chunk-${index}.txt`;
      chunkUrls.push({ index, url });
    }

    info({ sessionId: sid, count: chunkUrls.length }, "🧩 Built TTS chunk URL list");

    // Run TTS Processor (Amazon Polly)
    const results = await ttsProcessor({ sessionId: sid, chunks: chunkUrls });

    if (!results || !Array.isArray(results) || results.length === 0) {
      throw new Error("No TTS chunks were produced or returned.");
    }

    // Upload TTS summary metadata to R2 (meta bucket)
    const summary = {
      sessionId: sid,
      model: "Amazon Polly (Neural)",
      voice: DEFAULT_VOICE,
      region: AWS_REGION,
      chunks: results.length,
      createdAt: new Date().toISOString(),
    };

    await putJson("meta", `${sid}-tts-summary.json`, summary);
    info({ sessionId: sid, summary }, "✅ TTS orchestration complete");

    return summary;
  } catch (err) {
    error({ sessionId: sid, message: err.message, stack: err.stack }, "💥 TTS orchestration failed");
    throw err;
  } finally {
    stopHeartbeat(hb);
  }
}

// ------------------------------------------------------------
// 🧩 Default Export
// ------------------------------------------------------------
export default orchestrateTTS;
