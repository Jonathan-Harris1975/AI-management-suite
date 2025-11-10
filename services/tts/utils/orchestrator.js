// ============================================================
// 🎬 TTS Orchestrator — Cloud-Native Version (Final)
// ============================================================
//
// ✅ Secure (no embedded credentials)
// ✅ Reads text chunks from R2
// ✅ Builds correct chunk URL list
// ✅ Calls ttsProcessor() with those URLs
// ✅ Fully compatible with Render + Shiper env settings
// ============================================================

import { info, error } from "#logger.js";
import { listKeys } from "#shared/r2-client.js";
import { ttsProcessor } from "./ttsProcessor.js";
import { mergeProcessor } from "./mergeProcessor.js";

// Fallback for local dev if aliases not configured
let startHeartbeat;
try {
  startHeartbeat = (await import("#shared/utils/heartbeat.js")).default;
} catch {
  startHeartbeat = (await import("../../../shared/utils/heartbeat.js")).default;
}

// ------------------------------------------------------------------
// ⚙️ Environment-Driven Config
// ------------------------------------------------------------------
const R2_BUCKET_RAW_TEXT = process.env.R2_BUCKET_RAW_TEXT || "raw-text";
const R2_PUBLIC_BASE_URL_RAW_TEXT =
  process.env.R2_PUBLIC_BASE_URL_RAW_TEXT ||
  "https://pub-7a098297d4ef4011a01077c72929753c.r2.dev";

// ------------------------------------------------------------------
// 🎧 Main Function
// ------------------------------------------------------------------
export async function orchestrateTTS(sessionId) {
  info({ sessionId }, "🎬 Orchestration begin");

  try {
    startHeartbeat("ttsProcessor", sessionId);

    // -----------------------------------------------------------
    // 1️⃣ List text chunks from R2
    // -----------------------------------------------------------
    info({ sessionId }, "🔍 Listing text chunks from R2...");
    const chunkKeys = await listKeys(R2_BUCKET_RAW_TEXT, `${sessionId}/chunk-`);

    if (!chunkKeys || chunkKeys.length === 0) {
      throw new Error(`No text chunks found for session ${sessionId}`);
    }

    // -----------------------------------------------------------
    // 2️⃣ Build chunk URL list
    // -----------------------------------------------------------
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

    // -----------------------------------------------------------
    // 3️⃣ Run TTS Processor
    // -----------------------------------------------------------
    const audioChunks = await ttsProcessor(sessionId, chunkList);

    // -----------------------------------------------------------
    // 4️⃣ Merge TTS Chunks into Final Audio
    // -----------------------------------------------------------
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
