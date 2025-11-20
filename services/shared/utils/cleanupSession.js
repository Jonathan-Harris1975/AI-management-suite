// services/shared/utils/cleanupSession.js
// ============================================================
// 🧹 Session Cleanup Helper
// ============================================================
// Deletes all objects for a given sessionId from these R2 buckets:
//   • edited
//   • rawtext
//   • merged
//   • chunks
// Then logs a summary.
// ============================================================

import { log } from "#logger.js";
import { listKeys, deleteObject } from "#shared/r2-client.js";

const BUCKETS_TO_CLEAN = ["edited", "rawtext", "merged", "chunks"];

export async function cleanupSession(sessionId) {
  if (!sessionId) {
    log.warn("cleanupSession called without sessionId");
    return;
  }

  log.info("🧹 Starting R2 cleanup for session", { sessionId });

  for (const bucketKey of BUCKETS_TO_CLEAN) {
    try {
      // We assume all keys for this run start with the sessionId
      const prefix = String(sessionId);
      const keys = await listKeys(bucketKey, prefix);

      if (!keys || keys.length === 0) {
        log.debug("🧹 No keys to delete for bucket", { bucketKey, sessionId });
        continue;
      }

      log.info("🗑️ Deleting R2 objects for bucket", {
        bucketKey,
        sessionId,
        count: keys.length,
      });

      for (const key of keys) {
        try {
          await deleteObject(bucketKey, key);
        } catch (err) {
          log.warn("⚠️ Failed to delete R2 object", {
            bucketKey,
            key,
            sessionId,
            error: err?.message,
          });
        }
      }
    } catch (err) {
      log.warn("⚠️ Failed to list/delete keys for bucket", {
        bucketKey,
        sessionId,
        error: err?.message,
      });
    }
  }

  log.info("🧹 R2 cleanup completed for session", { sessionId });
}

export default cleanupSession;
