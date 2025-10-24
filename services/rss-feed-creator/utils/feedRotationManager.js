// services/rss-feed-creator/utils/feedRotationManager.js
import { info, warn } from "#logger.js";
import { getObjectAsText, putText } from "../../shared/utils/r2-client.js";

const BUCKET = process.env.R2_BUCKET_RSS_FEEDS || "rss-feeds";
const ROTATION_KEY = "data/feed-rotation.json";
const FEED_LIST_KEY = "data/rss-feeds.txt";
const CUTOFF_HOURS = Number(process.env.FEED_CUTOFF_HOURS || 24);

/**
 * Helper — check if feed item or timestamp is newer than cutoff
 */
function isRecent(pubDate, cutoffHours = CUTOFF_HOURS) {
  const d = new Date(pubDate);
  return (
    !Number.isNaN(d.getTime()) &&
    Date.now() - d.getTime() <= cutoffHours * 60 * 60 * 1000
  );
}

/**
 * Rotate feed list: read all feeds, return next feed index.
 * Stores the index persistently in R2.
 */
export async function rotateFeed() {
  try {
    info("🌀 feedRotationManager.start");

    // Load feed list
    const feedListText = await getObjectAsText(BUCKET, FEED_LIST_KEY);
    const feeds = feedListText
      .split(/\r?\n/)
      .map((f) => f.trim())
      .filter((f) => f.length > 0);

    if (!feeds.length) throw new Error("No feeds found in rss-feeds.txt");

    // Load last rotation state
    let rotation = { lastIndex: 0, lastUpdated: new Date().toISOString() };
    try {
      const rotationText = await getObjectAsText(BUCKET, ROTATION_KEY);
      rotation = JSON.parse(rotationText);
    } catch {
      warn("⚠️ feedRotationManager: no existing rotation file, creating new one.");
    }

    // Pick next feed index
    const nextIndex = (rotation.lastIndex + 1) % feeds.length;
    const selectedFeed = feeds[nextIndex];

    // Save updated rotation
    const newRotation = {
      lastIndex: nextIndex,
      lastUpdated: new Date().toISOString(),
    };
    await putText(BUCKET, ROTATION_KEY, JSON.stringify(newRotation, null, 2));

    info("✅ feedRotationManager.rotated", { nextIndex, selectedFeed });
    return selectedFeed;
  } catch (err) {
    warn("💥 feedRotationManager.failed", { error: err.message });
    throw err;
  }
}

/**
 * Filter feed items based on publication date cutoff.
 * Accepts parsed feed array, returns only recent items.
 */
export function filterRecentItems(items = []) {
  const filtered = items.filter((it) => {
    const pub = it.isoDate || it.pubDate || it.published || "";
    return isRecent(pub);
  });

  info("🧩 feedRotationManager.filter", {
    before: items.length,
    after: filtered.length,
    cutoffHours: CUTOFF_HOURS,
  });

  return filtered;
}

export default { rotateFeed, filterRecentItems };
