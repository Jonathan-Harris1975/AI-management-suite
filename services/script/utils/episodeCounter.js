// services/script/utils/episodeCounter.js
// ============================================================
// 🔢 Persistent Episode Counter (R2-backed)
// ============================================================
// - Uses R2 bucket alias "meta"
// - Key: podcast-meta/episode-counter.json
// - Respects PODCAST_RSS_EP env flag:
//     • "Yes"  -> real, persistent counter
//     • other  -> test mode (no R2 writes)
// ============================================================

import { log } from "#logger.js";
import { getObjectAsText, putJson } from "#shared/r2-client.js";

const EPISODE_COUNTER_BUCKET = "meta";
const EPISODE_COUNTER_KEY = "podcast-meta/episode-counter.json";

function isProductionEpisodeMode() {
  return process.env.PODCAST_RSS_EP === "Yes";
}

// ------------------------------------------------------------
// 🔍 Load current counter from R2 (or initialise)
// ------------------------------------------------------------
async function loadCounter() {
  try {
    const raw = await getObjectAsText(EPISODE_COUNTER_BUCKET, EPISODE_COUNTER_KEY);
    const parsed = JSON.parse(raw);
    if (typeof parsed.nextEpisodeNumber === "number" && parsed.nextEpisodeNumber > 0) {
      return parsed;
    }
  } catch (err) {
    log.warn("episodeCounter: failed to load existing counter, initialising new one", {
      error: err?.message,
    });
  }

  return { nextEpisodeNumber: 1 };
}

// ------------------------------------------------------------
// 💾 Save counter to R2
// ------------------------------------------------------------
async function saveCounter(counter) {
  await putJson(EPISODE_COUNTER_BUCKET, EPISODE_COUNTER_KEY, counter);
}

// ------------------------------------------------------------
// 🎚 Get the next episode number (or null in test mode)
// ------------------------------------------------------------
export async function getNextEpisodeNumber() {
  if (!isProductionEpisodeMode()) {
    log.info("episodeCounter: test mode active, not touching persistent counter", {
      PODCAST_RSS_EP: process.env.PODCAST_RSS_EP,
    });
    return null;
  }

  const counter = await loadCounter();
  const episodeNumber = counter.nextEpisodeNumber;

  counter.nextEpisodeNumber = episodeNumber + 1;
  await saveCounter(counter);

  log.info("episodeCounter: issued new episode number", { episodeNumber });
  return episodeNumber;
}

// ------------------------------------------------------------
// 🧩 Convenience helper: attach episodeNumber to meta
// ------------------------------------------------------------
export async function attachEpisodeNumberIfNeeded(meta) {
  if (!meta || typeof meta !== "object") return meta;

  const episodeNumber = await getNextEpisodeNumber();
  if (episodeNumber != null) {
    meta.episodeNumber = episodeNumber;
  }

  return meta;
}

export default {
  getNextEpisodeNumber,
  attachEpisodeNumberIfNeeded,
};
