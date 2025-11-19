// ============================================================
// 🧠 AI Podcast Suite — R2 Utility Helpers (Flat Version)
// ============================================================
//
// Provides higher-level helpers built on top of r2-client.js
// Used by orchestrators and pipelines.
// ============================================================

import { listKeys, R2_BUCKETS, buildPublicUrl } from "#shared/r2-client.js";
import { info, error } from "#logger.js";

/**
 * Returns an array of public URLs for all text chunks
 * associated with a specific sessionId.
 */
export async function getTextChunkUrls(sessionId) {
  try {
    const bucketKey = "rawtext"; // ensure consistent flat bucket naming
    const prefix = `${sessionId}/`;

    const keys = await listKeys(bucketKey, prefix);
    const urls = keys.map((k) => buildPublicUrl(bucketKey, k));

    info("getTextChunkUrls.success", { sessionId, count: urls.length });
    return urls;
  } catch (err) {
    error("getTextChunkUrls.fail", { sessionId, error: err.message });
    throw err;
  }
}

/**
 * Retrieves all objects (keys only) under a session prefix.
 */
export async function listSessionObjects(bucketKey, sessionId) {
  try {
    const prefix = `${sessionId}/`;
    const keys = await listKeys(bucketKey, prefix);
    info("listSessionObjects.success", { bucketKey, sessionId, count: keys.length });
    return keys;
  } catch (err) {
    error("listSessionObjects.fail", { bucketKey, sessionId, error: err.message });
    throw err;
  }
}

/**
 * Deletes all objects belonging to a session.
 */
export async function deleteSessionObjects(bucketKey, sessionId, deleteFn) {
  try {
    const prefix = `${sessionId}/`;
    const keys = await listKeys(bucketKey, prefix);
    for (const key of keys) {
      await deleteFn(bucketKey, key);
    }
    info("deleteSessionObjects.success", { bucketKey, sessionId, deleted: keys.length });
  } catch (err) {
    error("deleteSessionObjects.fail", { bucketKey, sessionId, error: err.message });
    throw err;
  }
}
