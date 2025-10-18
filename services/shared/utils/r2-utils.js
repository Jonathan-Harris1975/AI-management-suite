// ============================================================
// 🧠 AI Podcast Suite — R2 Utility Helpers
// ============================================================
//
// Provides higher-level helpers built on top of r2-client.js
// Used by orchestrators and pipelines.
// ============================================================

import { listKeys, R2_BUCKETS } from "#shared/r2-client.js";
import { info, error } from "#shared/logger.js";

/**
 * Returns an array of public URLs for all text chunks
 * associated with a specific sessionId.
 */
export async function getTextChunkUrls(sessionId) {
  try {
    if (!R2_BUCKETS.RAW_TEXT) {
      throw new Error("R2_BUCKETS.RAW_TEXT not defined");
    }

    const prefix = `${sessionId}/`; // or `raw-text/${sessionId}/` if objects are stored that way
    const keys = await listKeys({
      bucket: R2_BUCKETS.RAW_TEXT,
      prefix,
    });

    const baseUrl = process.env.R2_PUBLIC_BASE_URL_RAW_TEXT;
    if (!baseUrl) {
      throw new Error("R2_PUBLIC_BASE_URL_RAW_TEXT not defined");
    }

    const urls = keys.map((k) => `${baseUrl}/${k}`);
    info("getTextChunkUrls.success", { sessionId, count: urls.length });
    return urls;
  } catch (err) {
    error("getTextChunkUrls.fail", { sessionId, error: err.message });
    throw err;
  }
}
