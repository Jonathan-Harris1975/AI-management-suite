// services/artwork/utils/artwork.js
// ============================================================
// 🎨 Artwork helpers (shared R2 imports)
// ============================================================

import { putJson, getObject, putText } from "../../shared/utils/r2-client.js";
import { info, error } from "#shared/logger.js";

export async function generatePodcastArtwork(data) {
  const bucket = process.env.R2_BUCKET_ART || process.env.R2_BUCKET_META;
  const key = `artwork/${data.sessionId || Date.now()}.json`;
  await putJson(bucket, key, data);
  info("🎨 Artwork manifest saved to R2", { bucket, key });
  return { bucket, key };
}
