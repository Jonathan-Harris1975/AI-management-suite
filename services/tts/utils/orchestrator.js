// ============================================================
// 🎬 TTS Orchestrator — Cloud-Native, Secure, and Path-Stable
// ============================================================
//
// ✅ Uses env vars only (no hardcoded URLs)
// ✅ Works with R2 public URLs for chunk fetches
// ✅ Resolves heartbeat correctly whether on Render or locally
// ============================================================

import { info, error } from "#logger.js";
import { listKeys } from "#shared/r2-client.js";
import { ttsProcessor } from "./ttsProcessor.js";
import { mergeProcessor } from "./mergeProcessor.js";

// ------------------------------------------------------------
// 🫀 Heartbeat Import (robust cross-env resolution)
// ------------------------------------------------------------
let startHeartbeat;
try {
  // Preferred path when aliases are properly set up
  startHeartbeat = (await import("#shared/utils/heartbeat.js")).default;
} catch {
  // Fallback for Render or zipped deploys
  startHeartbeat = (await import("../../../shared/utils/heartbeat.js")).default;
}

// ------------------------------------------------------------
// ⚙️ Environment Config — No secrets in code
// ------------------------------------------------------------
const R2_BUCKET_RAW_TEXT = process.env.R2_BUCKET_RAW_TEXT;
const R2_PUBLIC_BASE_URL_RAW_TEXT = process.env.R2_PUBLIC_BASE_URL_RAW_TEXT;

if (!R2_BUCKET_RAW_TEXT || !R2_PUBLIC_BASE_URL_RAW_TEXT) {
  throw new Error("Missing R2 environment variables — check Shiper config.");
}

// ------------------------------------------------------------
// 🎧 Main Orchestration
// ------------------------------------------------------------
export async function orchestrateTTS(sessionId) {
  info({ sessionId }, "🎬 Orchestration begin");

  try {
    startHeartbeat("ttsProcessor", sessionId);

    // 1️⃣ List text chunks from R2
    info({ sessionId }, "🔍 Listing text chunks from R2...");
    const chunkKeys = await listKeys(R2_BUCKET_RAW_TEXT, `${sessionId}/chunk-`);

    if (!chunkKeys || chunkKeys.length === 0) {
      throw new Error(`No text chunks found for session ${sessionId}`);
    }

    // 2️⃣ Build chunk URL list
    const chunkList = chunkKeys
      .filter((k) => k.endsWith(".txt"))
      .sort()
      .map((key, idx) => ({
        index: idx + 1,
        key,
        url: `${R2_PUBLIC_BASE_URL_RAW_TEXT}/${encodeURIComponent(key)}`,
      }));

    if (chunkList.length === 0)
      throw new Error("No valid text chunks found to process.");

    info({ sessionId, count: chunkList.length }, "🧩 Chunks ready for TTS");
    info({ sessionId }, "📜 Text chunks collected");

    // 3️⃣ Run TTS Processor
    const audioChunks = await ttsProcessor(sessionId, chunkList);

    // 4️⃣ Merge TTS chunks into one file
    startHeartbeat("mergeProcessor", sessionId);
    const mergedResult = await mergeProcessor(sessionId, audioChunks);

    info({ sessionId }, "✅ Full TTS pipeline complete");
    return { sessionId, audioChunks, mergedResult };
  } catch (err) {
    error(
      { sessionId, error: err.message, stack: err.stack },
      "💥 TTS orchestration failed"
    );
    throw err;
  }
}

export default { orchestrateTTS };
