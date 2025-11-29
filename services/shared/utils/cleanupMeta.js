// services/shared/utils/cleanupMeta.js
// Removes invalid or system JSON files from the meta bucket

import { listKeys, deleteObject, getObjectAsText } from "#shared/r2-client.js";
import { info, warn } from "#logger.js";

const META_BUCKET = "meta";

function isSystemMeta(key) {
  return key.includes("counter") || key.includes("system") || key.startsWith("_");
}

function isValidEpisode(meta) {
  return (
    meta &&
    meta.session &&
    meta.session.sessionId &&
    meta.podcastUrl &&
    meta.title &&
    meta.episodeNumber
  );
}

export async function cleanupOrphanMeta() {
  info("🧹 Starting orphan metadata cleanup…");

  const keys = await listKeys(META_BUCKET, "");

  for (const key of keys) {
    if (isSystemMeta(key)) {
      await deleteObject(META_BUCKET, key);
      warn("Deleted system meta file", { key });
      continue;
    }

    try {
      const txt = await getObjectAsText(META_BUCKET, key);
      const json = JSON.parse(txt);

      if (!isValidEpisode(json)) {
        await deleteObject(META_BUCKET, key);
        warn("Deleted invalid metadata file", { key });
      }
    } catch {
      await deleteObject(META_BUCKET, key);
      warn("Deleted corrupt metadata file", { key });
    }
  }

  info("Cleanup complete.");
}
