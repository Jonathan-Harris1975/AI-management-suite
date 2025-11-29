// services/script/utils/episodeCounter.js
// Unified episode counter + auto-number assignment

import { getObjectAsText, putObject } from "#shared/r2-client.js";
import { info, warn } from "#logger.js";

// 👇 NEW BUCKET (make sure env contains R2_BUCKET_META_SYSTEM)
const COUNTER_BUCKET = "metasystem";
const COUNTER_KEY = "episode-counter.json";

/**
 * Load the next available episode number.
 */
export async function getNextEpisodeNumber() {
  try {
    const txt = await getObjectAsText(COUNTER_BUCKET, COUNTER_KEY);
    const json = JSON.parse(txt);
    return json.nextEpisodeNumber || 1;
  } catch {
    warn("Episode counter missing — starting at 1");
    return 1;
  }
}

/**
 * Increment and persist counter after assigning a new episode number.
 */
export async function incrementEpisodeCounter(current) {
  const next = { nextEpisodeNumber: current + 1 };

  await putObject(
    COUNTER_BUCKET,
    COUNTER_KEY,
    Buffer.from(JSON.stringify(next, null, 2), "utf-8"),
    "application/json"
  );

  info("Updated episode counter", next);
}

/**
 * MAIN FUNCTION REQUIRED BY orchestrator.js
 *
 * If metadata already has an episode number → keep it.
 * Otherwise → assign next value, update counter, return new metadata.
 */
export async function attachEpisodeNumberIfNeeded(meta) {
  if (!meta || typeof meta !== "object") return meta;

  if (meta.episodeNumber && Number(meta.episodeNumber) > 0) {
    info("Episode number already exists", { episodeNumber: meta.episodeNumber });
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
