// services/script/utils/episodeCounter.js
// Patched: episode counter uses dedicated bucket NOT meta/

import { getObjectAsText, putObject } from "#shared/r2-client.js";
import { info, warn } from "#logger.js";

const COUNTER_BUCKET = "metaSystem";
const COUNTER_KEY = "episode-counter.json";

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

export async function incrementEpisodeCounter(current) {
  const next = { nextEpisodeNumber: current + 1 };
  await putObject(COUNTER_BUCKET, COUNTER_KEY, JSON.stringify(next), {
    contentType: "application/json",
  });
  info("Updated episode counter", next);
}
