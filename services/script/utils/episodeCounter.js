// services/script/utils/episodeCounter.js
// ============================================================
// 🔢 Episode Counter (metasystem bucket)
//   - Stores a simple JSON: { "nextEpisodeNumber": N }
//   - Provides attachEpisodeNumberIfNeeded(meta)
// ============================================================

import { getObjectAsText, putObject } from "#shared/r2-client.js";
import { info, warn } from "#logger.js";

const COUNTER_BUCKET = "metasystem";
const COUNTER_KEY = "episode-counter.json";

export async function getNextEpisodeNumber() {
  try {
    const txt = await getObjectAsText(COUNTER_BUCKET, COUNTER_KEY);
    const json = JSON.parse(txt);
    return json.nextEpisodeNumber || 1;
  } catch (err) {
    warn("Episode counter missing — starting at 1");
    return 1;
  }
}

export async function incrementEpisodeCounter(current) {
  const next = { nextEpisodeNumber: current + 1 };

  await putObject(
    COUNTER_BUCKET,
    COUNTER_KEY,
    JSON.stringify(next),
    "application/json"
  );

  info("Updated episode counter", next);
}

/**
 * Attach an episodeNumber to metadata if missing.
 * Uses metasystem counter, then increments it.
 */
export async function attachEpisodeNumberIfNeeded(meta) {
  if (!meta || typeof meta !== "object") return meta;

  if (meta.episodeNumber && Number(meta.episodeNumber) > 0) {
    info("Episode number already present", {
      episodeNumber: meta.episodeNumber,
    });
    return meta;
  }

  const next = await getNextEpisodeNumber();
  meta.episodeNumber = next;

  await incrementEpisodeCounter(next);

  info("Assigned new episode number", { episodeNumber: next });

  return meta;
}

export default {
  getNextEpisodeNumber,
  incrementEpisodeCounter,
  attachEpisodeNumberIfNeeded,
};
