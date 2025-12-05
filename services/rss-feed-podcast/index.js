// services/rss-feed-podcast/index.js
// ============================================================
// 📡 Podcast RSS Feed Creator - Orchestrator (FIXED)
// ============================================================
//
// - Reads episode meta JSON from R2 bucket alias "meta"
// - Builds RSS XML
// - Uploads to R2 bucket alias "podcastRss"
// - Optional: AUTO_CALL=yes → notify PodcastIndex Hub automatically
// ============================================================

import { listKeys, getObjectAsText, putObject } from "#shared/r2-client.js";
import { info, warn, error } from "#logger.js";
import { generateFeedXML } from "./generateFeed.js";
import { notifyHubByUrl } from "#shared/podcastIndexClient.js";

const META_BUCKET_ALIAS = "meta";

// FIXED: your files live in bucket root, NOT "podcast-meta/"
const META_PREFIX = "";

const RSS_BUCKET_ALIAS = "podcastRss";
const RSS_KEY = "turing-torch.xml";

// Feed URL for PodcastIndex notifications
const FEED_URL =
  process.env.PODCAST_RSS_FEED_URL ||
  `${process.env.R2_PUBLIC_BASE_URL_RSS_FEEDS || ""}/turing-torch.xml`;

export async function runRssFeedCreator() {
  info("🚀 Starting RSS feed generation");

  // ------------------------------------------------------------
  // Load meta files
  // ------------------------------------------------------------
  let keys;
  try {
    keys = await listKeys(META_BUCKET_ALIAS, META_PREFIX);
  } catch (err) {
    error("Failed to list meta objects", { error: err.message });
    throw err;
  }

  if (!Array.isArray(keys) || keys.length === 0) {
    warn("No metadata files found in meta bucket");
    return;
  }

  const metaKeys = keys.filter((key) =>
    typeof key === "string" ? key.endsWith(".json") : false
  );

  if (metaKeys.length === 0) {
    warn("No .json metadata files found in meta bucket root");
    return;
  }

  info("Found metadata files", { count: metaKeys.length });

  const episodes = [];

  for (const key of metaKeys) {
    try {
      const text = await getObjectAsText(META_BUCKET_ALIAS, key);
      const json = JSON.parse(text);
      episodes.push(json);
    } catch (err) {
      warn("Failed to parse meta file", { key, error: err.message });
    }
  }

  if (episodes.length === 0) {
    warn("No valid episode metadata parsed – RSS not generated");
    return;
  }

  // ------------------------------------------------------------
  // Build XML
  // ------------------------------------------------------------
  let xml;
  try {
    xml = generateFeedXML(episodes);
  } catch (err) {
    error("Failed to generate RSS XML", { error: err.message });
    throw err;
  }

  // ------------------------------------------------------------
  // Upload RSS
  // ------------------------------------------------------------
  try {
    await putObject(
      RSS_BUCKET_ALIAS,
      RSS_KEY,
      Buffer.from(xml, "utf-8"),
      "application/rss+xml"
    );

    info("RSS feed uploaded successfully", {
      bucketAlias: RSS_BUCKET_ALIAS,
      key: RSS_KEY,
    });
  } catch (err) {
    error("Failed to upload RSS feed", { error: err.message });
    throw err;
  }

  // ------------------------------------------------------------
  // PodcastIndex Auto Notify (if enabled)
  // ------------------------------------------------------------
  const shouldAutoCall =
    String(process.env.AUTO_CALL || "").toLowerCase() === "yes";

  if (!shouldAutoCall) {
    info("AUTO_CALL disabled — PodcastIndex Hub NOT notified.");
    return;
  }

  info("📡 AUTO_CALL=yes — notifying PodcastIndex Hub…", {
    feedUrl: FEED_URL,
  });

  try {
    const res = await notifyHubByUrl(process.env.PODCAST_LINK);
    info("📡 PodcastIndex Hub notified successfully!", {
      result: res?.status,
      feedUrl: FEED_URL,
    });
  } catch (err) {
    warn("⚠️ PodcastIndex Hub notify failed", {
      feedUrl: FEED_URL,
      error: String(err),
    });
  }
}

export default runRssFeedCreator;
