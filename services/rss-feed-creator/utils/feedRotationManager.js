// services/rss-feed-creator/utils/feedRotation.js
import { info } from "#logger.js";

/**
 * Select the next batch of RSS feeds and one site URL to process.
 * Pulls from feed list and rotation state.
 */
export function loadFeedRotation({
  allFeeds = [],
  siteFeeds = [],
  rotationIndex = 0,
  maxFeeds = parseInt(process.env.MAX_FEEDS_PER_RUN || "5", 10),
} = {}) {
  if (!Array.isArray(allFeeds) || allFeeds.length === 0) {
    throw new Error("No feeds available");
  }

  const totalFeeds = allFeeds.length;
  const start = rotationIndex % totalFeeds;
  const selected = [];

  for (let i = 0; i < maxFeeds; i++) {
    const idx = (start + i) % totalFeeds;
    selected.push(allFeeds[idx]);
  }

  const siteIndex = rotationIndex % (siteFeeds.length || 1);
  const selectedSite = siteFeeds[siteIndex] || "https://jonathan-harris.online";

  info("rss.rotation", {
    selectedFeeds: selected.length,
    selectedSite,
    rotationIndex,
    nextIndex: (rotationIndex + maxFeeds) % totalFeeds,
  });

  return {
    selectedFeeds: selected,
    selectedSite,
    nextRotationIndex: (rotationIndex + maxFeeds) % totalFeeds,
  };
}
