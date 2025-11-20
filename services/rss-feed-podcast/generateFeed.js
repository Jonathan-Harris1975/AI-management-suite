// services/rss-feed-podcast/generateFeed.js
// ============================================================
// 🧩 RSS Feed XML Generator (from meta JSON)
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

  info(`📝 Building RSS feed with ${sorted.length} episodes`);

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
      process.env.PODCAST_CATEGORY_2 || "",
    ].filter(Boolean),
    fundingUrl: process.env.funding_url || "",
    fundingText: process.env.funding_text || "",
    rssSelfLink:
      process.env.PODCAST_RSS_FEED_URL ||
      process.env.R2_PUBLIC_BASE_URL_RSS_FEEDS ||
      "",
  };

  const items = sorted.map(mapMetaToEpisode).filter(Boolean);

  if (items.length === 0) {
    warn("No valid items generated for RSS feed");
  }

  return buildRssXml(channel, items);
}

function mapMetaToEpisode(meta) {
  const {
    title,
    description,
    sessionId,
    podcastUrl,
    artUrl,
    transcriptUrl,
    duration,
    fileSize,
    pubDate,
    updatedAt,
    episodeNumber,
    keywords,
  } = meta;

  if (!title || !podcastUrl || !sessionId) {
    return null;
  }

  const guid = sessionId;
  const pubDateStr = pubDate
    ? new Date(pubDate).toUTCString()
    : updatedAt
    ? new Date(updatedAt).toUTCString()
    : new Date().toUTCString();

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
    keywordsCsv,
  };
}

function stripQuotes(str) {
  // In case env accidentally has quotes like PODCAST_LINK="\"https://example.com\""
  return String(str).replace(/^"+|"+$/g, "").trim();
    }
