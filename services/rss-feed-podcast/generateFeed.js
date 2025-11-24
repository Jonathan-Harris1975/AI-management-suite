// ============================================================
// 🧩 RSS Feed XML Generator (FULLY UPDATED)
// ============================================================
//
// Improvements:
// ✔ Accepts both meta.sessionId and meta.session.sessionId
// ✔ Strong validation + descriptive warnings
// ✔ Prevents silent episode drops
// ✔ Stable date handling (pubDate → updatedAt → now)
// ✔ Clean keyword CSV generation
// ============================================================

import { buildRssXml } from "./xmlBuilder.js";
import { info, warn } from "#logger.js";

export function generateFeedXML(episodesMeta) {
  if (!Array.isArray(episodesMeta) || episodesMeta.length === 0) {
    throw new Error("No episode metadata provided to generateFeedXML");
  }

  // Sort newest → oldest by pubDate
  const sorted = [...episodesMeta].sort((a, b) => {
    const da = new Date(a.pubDate || a.updatedAt || 0).getTime();
    const db = new Date(b.pubDate || b.updatedAt || 0).getTime();
    return db - da;
  });

  info(`📝 Building RSS feed with ${sorted.length} episode(s)`);

  // Map show-level env vars
  const rawLang = (process.env.PODCAST_LANGUAGE || "en-gb")
    .trim()
    .toLowerCase();
  const language = rawLang === "en-uk" ? "en-gb" : rawLang;

  const channel = {
    title: process.env.PODCAST_TITLE || "Podcast",
    link: stripQuotes(process.env.PODCAST_LINK || ""),
    description: process.env.PODCAST_DESCRIPTION || "",
    language,
    copyright: process.env.PODCAST_COPYRIGHT || "",
    itunesAuthor: process.env.PODCAST_AUTHOR || "",
    itunesExplicit: process.env.PODCAST_EXPLICIT || "no",
    itunesType: process.env.itunes_type || "episodic",
    itunesKeywords: process.env.itunes_keywords || "",
    ownerName: process.env.PODCAST_OWNER_NAME || "",
    ownerEmail: process.env.PODCAST_OWNER_EMAIL || "",
    imageUrl: process.env.PODCAST_IMAGE_URL || "",
    categories: [
      process.env.PODCAST_CATEGORY_1 || "",
      process.env.PODCAST_CATEGORY_2 || ""
    ].filter(Boolean),
    fundingUrl: process.env.funding_url || "",
    fundingText: process.env.funding_text || "",
    rssSelfLink:
      process.env.PODCAST_RSS_FEED_URL ||
      process.env.R2_PUBLIC_BASE_URL_RSS_FEEDS ||
      ""
  };

  const items = sorted.map(mapMetaToEpisode).filter(Boolean);

  if (items.length === 0) {
    warn("⚠️ RSS generated with ZERO valid episode items.");
  } else {
    info(`📦 Final RSS will include ${items.length} item(s).`);
  }

  return buildRssXml(channel, items);
}

// ============================================================
// Episode Mapper (FULLY UPDATED)
// ============================================================

function mapMetaToEpisode(meta) {
  // 🔥 Robust sessionId resolution
  const sessionId =
    meta.sessionId ||
    meta.session?.sessionId ||
    null;

  const {
    title,
    description,
    podcastUrl,
    artUrl,
    transcriptUrl,
    duration,
    fileSize,
    pubDate,
    updatedAt,
    episodeNumber,
    keywords
  } = meta;

  // 🔥 Show detailed info for missing fields
  if (!sessionId || !title || !podcastUrl) {
    warn("⚠️ Episode metadata missing required fields – skipped", {
      title,
      podcastUrl,
      hasPodcastUrl: !!podcastUrl,
      hasSessionId: !!sessionId,
      rawSessionId: meta.sessionId,
      nestedSessionId: meta.session?.sessionId
    });
    return null;
  }

  const guid = sessionId;

  // 🔥 Strong and resilient pubDate handling
  const pubDateStr = pubDate
    ? new Date(pubDate).toUTCString()
    : updatedAt
    ? new Date(updatedAt).toUTCString()
    : new Date().toUTCString();

  // Convert keywords array → CSV
  const keywordsCsv = Array.isArray(keywords)
    ? keywords.join(", ")
    : typeof keywords === "string"
    ? keywords
    : "";

  return {
    title,
    description: description || "",
    guid,
    pubDate: pubDateStr,
    enclosureUrl: podcastUrl,
    enclosureLength: fileSize || 0,
    durationSeconds: typeof duration === "number" ? duration : null,
    episodeNumber:
      typeof episodeNumber === "number" ? episodeNumber : undefined,
    imageUrl: artUrl || "",
    transcriptUrl: transcriptUrl || "",
    keywordsCsv
  };
}

// ============================================================
// Helpers
// ============================================================

function stripQuotes(str) {
  return String(str).replace(/^"+|"+$/g, "").trim();
}
