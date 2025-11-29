// services/rss-feed-podcast/index.js
// Patched: Ignore system files + strict schema validation + safe XML upload

import { listKeys, getObjectAsText, putObject } from "#shared/r2-client.js";
import { info, warn, error } from "#logger.js";
import { generateFeedXML } from "../rss-feed-podcast/generateFeed.js";
import { notifyHubByUrl } from "#shared/podcastIndexClient.js";

const META_BUCKET = "meta";
const RSS_BUCKET = "podcastRss";
const RSS_KEY = "turing-torch.xml";

function isSystemMeta(key) {
  return key.includes("counter") || key.startsWith("_") || key.includes("system");
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

export async function runRssFeedCreator() {
  info("🚀 Running RSS feed creator…");

  const keys = await listKeys(META_BUCKET, "");
  if (!keys || keys.length === 0) {
    warn("No metadata files found.");
    return;
  }

  info("Found metadata files", { count: keys.length });

  const episodes = [];

  for (const key of keys) {
    if (isSystemMeta(key)) {
      warn("Skipping system/meta file", { key });
      continue;
    }

    try {
      const txt = await getObjectAsText(META_BUCKET, key);
      const meta = JSON.parse(txt);

      if (!isValidEpisode(meta)) {
        warn("Skipping invalid episode metadata", { key });
        continue;
      }

      episodes.push(meta);
    } catch (err) {
      warn("Failed parsing metadata file", { key, error: err.message });
    }
  }

  if (episodes.length === 0) {
    warn("RSS generation aborted — no valid episodes.");
    return;
  }

  let xml;
  try {
    xml = generateFeedXML(episodes).replace(/\x00/g, ""); // safety clean
  } catch (err) {
    error("RSS XML generation failed", { error: err.message });
    throw err;
  }

  try {
    await putObject(RSS_BUCKET, RSS_KEY, xml, {
      contentType: "application/rss+xml; charset=utf-8",
    });
    info("RSS feed uploaded", { RSS_BUCKET, RSS_KEY });
  } catch (err) {
    error("RSS upload failed", { error: err.message });
  }
}

export default runRssFeedCreator;
