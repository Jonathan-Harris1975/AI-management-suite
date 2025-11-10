// services/tts/utils/ttsprocessor.js
// ============================================================
// 🎛 TTS Orchestrator — R2-Aware Direct Listing Version
// ============================================================
// Automatically lists available chunk objects in R2_BUCKET_RAW_TEXT
// and constructs their public URLs via R2_PUBLIC_BASE_URL_RAW_TEXT.
// Fully logs session, model, and voice setup.
// ============================================================

import { ttsProcessor } from "./ttsProcessor.js";
import { info, error } from "#logger.js";
import { startHeartbeat, stopHeartbeat } from "../../shared/utils/heartbeat.js";
import { s3 } from "#shared/r2-client.js";
import { ListObjectsV2Command } from "@aws-sdk/client-s3";

const BUCKET = process.env.R2_BUCKET_RAW_TEXT;
const PUBLIC_BASE = process.env.R2_PUBLIC_BASE_URL_RAW_TEXT;
const MODEL = "Amazon Polly (Neural)";
const VOICE = process.env.POLLY_VOICE_ID || "Brian";

// ------------------------------------------------------------
// Helper: List available chunks in R2
// ------------------------------------------------------------
async function listChunksFromR2(sessionId) {
  info({ sessionId, bucket: BUCKET }, "🔍 Listing chunks in R2...");

  const command = new ListObjectsV2Command({
    Bucket: BUCKET,
    Prefix: `${sessionId}/chunk-`,
  });

  const { Contents = [] } = await s3.send(command);
  const chunkKeys = Contents.filter((c) => c.Key.endsWith(".txt"))
    .sort((a, b) => a.Key.localeCompare(b.Key))
    .map((c) => c.Key);

  info({ sessionId, found: chunkKeys.length }, "🧩 R2 chunks listed successfully");

  return chunkKeys.map((key, index) => ({
    index: index + 1,
    key,
    url: `${PUBLIC_BASE}/${encodeURIComponent(key)}`,
  }));
}

// ------------------------------------------------------------
// Main Orchestration
// ------------------------------------------------------------
export async function orchestrateTTS(sessionId) {
  info({ sessionId }, "🎬 TTS Orchestration begin");
  info({ model: MODEL, voice: VOICE }, "🎙 TTS Model Configuration");

  const hb = startHeartbeat(`ttsProcessor:${sessionId}`);

  try {
    const chunks = await listChunksFromR2(sessionId);

    if (!chunks.length) {
      throw new Error(`No text chunks found in R2 for ${sessionId}.`);
    }

    info(
      { sessionId, count: chunks.length },
      "✅ Valid chunk list constructed — starting TTS synthesis"
    );

    const results = await ttsProcessor({
      sessionId,
      chunks,
      model: MODEL,
      voice: VOICE,
    });

    const successCount = results.filter((r) => r.success).length;
    const failCount = results.filter((r) => !r.success).length;

    info(
      { sessionId, successCount, failCount },
      "🎧 TTS Summary — Synthesis complete"
    );

    return results;
  } catch (err) {
    error(
      { sessionId, error: err.message, stack: err.stack?.split("\n").slice(0, 3) },
      "💥 TTS orchestration failed"
    );
    throw err;
  } finally {
    stopHeartbeat(hb);
  }
}

export default { orchestrateTTS };
