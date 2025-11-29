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

// Feed URL for PodcastIndex notifications (robust absolute URL builder)
function buildFeedUrl() {
  const filename = RSS_KEY;
  const explicit = (process.env.PODCAST_RSS_FEED_URL || "").trim();
  const baseFromEnv =
    (process.env.R2_PUBLIC_BASE_URL_RSS_FEEDS ||
      process.env.R2_PUBLIC_BASE_URL_PODCAST ||
      "").trim();

  // If explicitly set to full URL, trust it
  if (explicit && /^https?:\/\//i.test(explicit)) {
    return explicit;
  }

  // If explicitly set but looks like a path (e.g. "/turing-torch.xml"),
  // try to combine with a configured public base URL.
  if (explicit && explicit.startsWith("/")) {
    if (!baseFromEnv) {
      warn(
        "PODCAST_RSS_FEED_URL is relative but no base URL configured; PodcastIndex notify may fail.",
        { explicit }
      );
      return explicit; // preserve existing behaviour as last resort
    }
    return `${baseFromEnv.replace(/\/+$/, "")}${explicit}`;
  }

  // If no explicit value, but we have a base URL, build from it
  if (baseFromEnv) {
    return `${baseFromEnv.replace(/\/+$/, "")}/${filename}`;
  }

  // Absolute fallback: log a warning and return a relative path
  warn(
    "No PODCAST_RSS_FEED_URL or base RSS URL configured; using relative path which PodcastIndex may reject.",
    { filename }
  );
  return `/${filename}`;
}

const FEED_URL = buildFeedUrl();

export async function runRssFeedCreator() {
  info("🚀 Starting RSS feed generation");

  // ------------------------------------------------------------
  // Discover meta JSON files
  // ------------------------------------------------------------
  const keys = await listKeys(META_BUCKET_ALIAS, META_PREFIX);

  if (!keys || keys.length === 0) {
    warn("No metadata files found in R2 — RSS feed will be empty.");
    return;
  }

  info("Found metadata files", {
    count: keys.length,
  });

  // ------------------------------------------------------------
  // Load + parse metadata
  // ------------------------------------------------------------
  const episodes = [];

  for (const key of keys) {
    try {
      const jsonText = await getObjectAsText(META_BUCKET_ALIAS, key);
      const meta = JSON.parse(jsonText);

      episodes.push(meta);
    } catch (err) {
      warn("Failed to parse metadata JSON — skipping file", {
        key,
        error: err.message,
      });
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
    await putObject(RSS_BUCKET_ALIAS, RSS_KEY, xml, {
      contentType: "application/rss+xml",
    });

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
    const res = await notifyHubByUrl(FEED_URL);
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
