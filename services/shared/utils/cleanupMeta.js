// services/shared/utils/cleanupMeta.js
// ============================================================
// 🧹 SAFE Metadata Cleanup
//   - Keeps all valid or partial episode JSON until audio exists
//   - Removes corrupt JSON, zero-byte files, or non-episode objects
//   - Leaves episode counter intact
// ============================================================

import { listKeys, deleteObject, getObjectAsText } from "#shared/r2-client.js";
import { info, warn, debug } from "#logger.js";

const META_BUCKET = "meta";

// Only delete these explicit system files
function isSystemMeta(key) {
  return (
    key === "episode-counter.json" ||
    key === "_system.json" ||
    key.startsWith("_")
  );
}

// Episode JSON is considered valid if it has at least:
//   - session.sessionId
//   - title
//   - description
//   - pubDate
// podcastUrl may still be missing (audio not yet processed)
function isLikelyEpisode(meta) {
  return (
    meta &&
    typeof meta === "object" &&
    meta.session &&
    meta.session.sessionId &&
    meta.title &&
    meta.description &&
    meta.pubDate
  );
}

export async function cleanupOrphanMeta() {
  info("🧹 Starting SAFE metadata cleanup…");

  const keys = await listKeys(META_BUCKET, "");

  for (const key of keys) {
    // Keep counter + protected keys
    if (isSystemMeta(key)) continue;

    try {
      const txt = await getObjectAsText(META_BUCKET, key);
      if (!txt || txt.trim().length === 0) {
        await deleteObject(META_BUCKET, key);
        warn("Deleted empty metadata file", { key });
        continue;
      }

      const json = JSON.parse(txt);

      // KEEP: partial / full / fresh episodes
      if (isLikelyEpisode(json)) {
        debug("Keeping metadata file", { key });
        continue;
      }

      // Delete everything else
      await deleteObject(META_BUCKET, key);
      warn("Deleted invalid metadata file", { key });

    } catch (err) {
      await deleteObject(META_BUCKET, key);
      warn("Deleted corrupt metadata file", { key, err: err.message });
    }
  }

  info("🧹 SAFE metadata cleanup complete.");
}

export default { cleanupOrphanMeta };
