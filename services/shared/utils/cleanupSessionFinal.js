// services/shared/utils/cleanupSessionFinal.js
// ============================================================
// 🧹 FINAL MEMORY CLEANUP (TEMPORARY FAILSAFE)
// ============================================================
// Scans *all relevant R2 buckets* and removes ANY objects whose
// key contains the sessionId anywhere in the name — not just prefix.
// This catches stragglers missed by the main cleanupSession.
// ============================================================

import { log, debug } from "#logger.js";
import { listKeys, deleteObject } from "#shared/r2-client.js";

const ALL_BUCKETS = [
  "edited",
  "rawtext",
  "merged",
  "chunks",
  "raw-text",
  "edited-audio"
];

export async function finalCleanupSession(sessionId) {
  if (!sessionId) {
    log.warn("finalCleanupSession called without sessionId");
    return;
  }

  log.debug("🧹 FINAL cleanup starting for session", { sessionId });

  const target = String(sessionId);

  for (const bucketKey of ALL_BUCKETS) {
    try {
      const keys = await listKeys(bucketKey, "");

      if (!keys || keys.length === 0) continue;

      // Only delete objects that contain the sessionId anywhere
      const hits = keys.filter((k) => k.includes(target));

      if (!hits.length) {
        debug("🧹 No stray objects found in bucket", { bucketKey });
        continue;
      }

      log.debug("🗑️ FINAL cleanup deleting objects", {
        bucketKey,
        count: hits.length,
        sessionId
      });

      for (const key of hits) {
        try {
          await deleteObject(bucketKey, key);
        } catch (err) {
          log.warn("⚠️ FINAL cleanup failed to delete object", {
            bucketKey,
            key,
            sessionId,
            error: err?.message,
          });
        }
      }
    } catch (err) {
      log.warn("⚠️ FINAL cleanup listing failed", {
        bucketKey,
        sessionId,
        error: err?.message,
      });
    }
  }

  log.info("🧹 FINAL cleanup completed", { sessionId });
}

export default finalCleanupSession;
