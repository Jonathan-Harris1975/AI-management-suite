// services/shared/utils/cleanupTempMemory.js
// ============================================================
// 🧽 TEMPORARY MEMORY CLEANER (No bucket deletion)
// ============================================================
// Clears ALL in-process caches, buffers, and temp state
// associated with a sessionId. Safe to call at the end of a run.
//
// Targets:
//   • sessionCache (temp LLM metadata, artworkPrompt, partial meta)
//   • global._sessionData (if used)
//   • global prompt caches
//   • temporary retry buffers
//   • any in-memory transcripts or chunks
//
// DOES NOT touch R2 or delete any files.
// ============================================================

import { log } from "#logger.js";
import * as sessionCache from "../../script/utils/sessionCache.js";

export async function cleanupTempMemory(sessionId) {
  if (!sessionId) {
    log.warn("cleanupTempMemory called without sessionId");
    return;
  }

  log.debug("🧽 Clearing temporary in-memory state", { sessionId });

  try {
    // 1. Clear sessionCache (LLM metadata temp storage)
    if (typeof sessionCache.clearSession === "function") {
      await sessionCache.clearSession(sessionId);
      log.debug("🧽 sessionCache cleared", { sessionId });
    }

    // 2. Global caches (failsafe)
    if (global._sessionData && global._sessionData[sessionId]) {
      delete global._sessionData[sessionId];
      log.debug("🧽 global._sessionData cleared", { sessionId });
    }

    if (global._promptCache && global._promptCache[sessionId]) {
      delete global._promptCache[sessionId];
      log.debug("🧽 global._promptCache cleared", { sessionId });
    }

    // 3. Generic wipe of any generic temp store
    const globalsToCheck = ["_tempChunks", "_tempTranscript", "_metaPending"];
    for (const key of globalsToCheck) {
      if (global[key] && global[key][sessionId]) {
        delete global[key][sessionId];
        log.debug(`🧽 Cleared global.${key}`, { sessionId });
      }
    }

    log.info("🧽 Temporary memory fully cleared", { sessionId });
  } catch (err) {
    log.warn("⚠️ cleanupTempMemory failed", {
      sessionId,
      error: err?.message,
    });
  }
}

export default cleanupTempMemory;
