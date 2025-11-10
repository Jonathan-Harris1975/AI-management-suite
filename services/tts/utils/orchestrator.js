// services/tts/utils/orchestrator.js
// ============================================================
// 🎛 TTS Orchestrator — Root-level chunk URL pattern version
// ============================================================
//
// Example:
//   https://pub-7a098297d4ef4011a01077c72929753c.r2.dev/TT-2025-11-10/chunk-001.txt
//
// Steps:
//   • Build chunk URLs for sessionId
//   • Verify accessibility with HEAD requests
//   • Run ttsProcessor on confirmed chunks
// ============================================================

import { ttsProcessor } from "./ttsProcessor.js";
import { info, error, debug } from "#logger.js";
import { startHeartbeat, stopHeartbeat } from "../../shared/utils/heartbeat.js";

// Base public URL for R2 raw-text bucket (root-level)
const BASE_URL = process.env.R2_PUBLIC_BASE_URL_RAW_TEXT;

async function urlExists(url) {
  try {
    const res = await fetch(url, { method: "HEAD" });
    return res.ok;
  } catch {
    return false;
  }
}

async function buildChunkUrls(sessionId, maxChunks = 60) {
  info({ sessionId }, "🔍 Building and validating chunk URLs...");
  const valid = [];

  for (let i = 1; i <= maxChunks; i++) {
    const chunkName = `chunk-${String(i).padStart(3, "0")}.txt`;
    const url = `${BASE_URL}/${sessionId}/${chunkName}`;
    if (await urlExists(url)) {
      valid.push({ index: i, url });
      info({ index: i, url }, "✅ Chunk confirmed");
    } else {
      debug({ index: i, url }, "⚠️ Chunk not found, stopping scan");
      break;
    }
  }

  info({ sessionId, count: valid.length }, "🧩 Chunk URL validation complete");
  return valid;
}

export async function orchestrateTTS(sessionId) {
  info({ sessionId }, "🎬 TTS Orchestration begin");

  const hb = startHeartbeat(`ttsProcessor:${sessionId}`);
  try {
    const chunks = await buildChunkUrls(sessionId, 60);

    if (!chunks.length) {
      throw new Error("No valid chunk URLs found for this session.");
    }

    const results = await ttsProcessor({ sessionId, chunks });

    info({ sessionId, total: results.length }, "🎧 TTS complete");
    return results;
  } catch (err) {
    error({ sessionId, error: err.message, stack: err.stack?.split("\n").slice(0, 3) }, "💥 TTS orchestration failed");
    throw err;
  } finally {
    stopHeartbeat(hb);
  }
}

export default { orchestrateTTS };
