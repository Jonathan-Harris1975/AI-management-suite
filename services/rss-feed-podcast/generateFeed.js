_--_-________________



// ============================================================
// 🧩 RSS Feed XML Generator (from meta JSON)
// ============================================================

import { buildRssXml } from "./xmlBuilder.js";
import { info, warn, error } from "#logger.js";

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
  const rawLang = (process.env.PODCAST_LANGUAGE || "en-gb").trim().toLowerCase();
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

  const items = sorted
    .map((meta) => mapMetaToEpisode(meta))
    .filter(Boolean);

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

___________--- xmlBuilder.js —______________


// ============================================================
// 🏗 XML Builder for Podcast RSS
// ============================================================
//
// Expects:
//   channel: {
//     title, link, description, language, copyright,
//     itunesAuthor, itunesExplicit, itunesType, itunesKeywords,
//     ownerName, ownerEmail, imageUrl,
//     categories: [string],
//     fundingUrl, fundingText,
//     rssSelfLink (optional)
//   }
//
//   items: [{
//     title, description, guid, pubDate,
//     enclosureUrl, enclosureLength, durationSeconds,
//     episodeNumber, imageUrl, transcriptUrl, keywordsCsv
//   }]
// ============================================================

export function buildRssXml(channel, items) {
  const {
    title,
    link,
    description,
    language,
    copyright,
    itunesAuthor,
    itunesExplicit,
    itunesType,
    itunesKeywords,
    ownerName,
    ownerEmail,
    imageUrl,
    categories = [],
    fundingUrl,
    fundingText,
    rssSelfLink,
  } = channel;

  const now = new Date().toUTCString();

  const parts = [];

  parts.push(`<?xml version="1.0" encoding="UTF-8"?>`);
  parts.push(
    `<rss version="2.0"
  xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd"
  xmlns:podcast="https://podcastindex.org/namespace/1.0"
  xmlns:atom="http://www.w3.org/2005/Atom">`
  );
  parts.push(`<channel>`);

  // Core channel info
  if (title) parts.push(tag("title", title));
  if (link) parts.push(tag("link", link));
  if (description) parts.push(tag("description", description));
  if (language) parts.push(tag("language", language));
  if (copyright) parts.push(tag("copyright", copyright));

  // Atom self-link (optional)
  if (rssSelfLink) {
    parts.push(
      `<atom:link href="${escapeXml(
        rssSelfLink
      )}" rel="self" type="application/rss+xml" />`
    );
  }

  // Dates
  parts.push(tag("lastBuildDate", now));

  // iTunes show-level
  if (itunesAuthor) parts.push(tag("itunes:author", itunesAuthor));
  if (itunesExplicit) parts.push(tag("itunes:explicit", itunesExplicit));
  if (itunesType) parts.push(tag("itunes:type", itunesType));
  if (itunesKeywords)
    parts.push(tag("itunes:keywords", itunesKeywords));

  if (ownerName || ownerEmail) {
    parts.push("<itunes:owner>");
    if (ownerName) parts.push(tag("itunes:name", ownerName));
    if (ownerEmail) parts.push(tag("itunes:email", ownerEmail));
    parts.push("</itunes:owner>");
  }

  if (imageUrl) {
    parts.push(
      `<itunes:image href="${escapeXml(imageUrl)}" />`
    );
  }

  // Categories
  categories
    .filter(Boolean)
    .forEach((cat) => {
      parts.push(
        `<itunes:category text="${escapeXml(cat)}"></itunes:category>`
      );
    });

  // Funding (Podcasting 2.0)
  if (fundingUrl) {
    const text = fundingText || "";
    parts.push(
      `<podcast:funding url="${escapeXml(
        fundingUrl
      )}">${escapeXml(text)}</podcast:funding>`
    );
  }

  // Episodes
  items.forEach((ep) => {
    parts.push("<item>");

    if (ep.title) parts.push(tag("title", ep.title));
    if (ep.description)
      parts.push(tag("description", ep.description));
    if (ep.guid) parts.push(tag("guid", ep.guid));
    if (ep.pubDate) parts.push(tag("pubDate", ep.pubDate));

    if (ep.enclosureUrl) {
      parts.push(
        `<enclosure url="${escapeXml(
          ep.enclosureUrl
        )}" length="${ep.enclosureLength || 0}" type="audio/mpeg" />`
      );
    }

    if (typeof ep.durationSeconds === "number") {
      parts.push(
        tag("itunes:duration", formatDuration(ep.durationSeconds))
      );
    }

    if (typeof ep.episodeNumber === "number") {
      parts.push(tag("itunes:episode", ep.episodeNumber));
    }

    if (ep.imageUrl) {
      parts.push(
        `<itunes:image href="${escapeXml(ep.imageUrl)}" />`
      );
    }

    if (ep.transcriptUrl) {
      parts.push(
        `<podcast:transcript url="${escapeXml(
          ep.transcriptUrl
        )}" type="text/plain" />`
      );
    }

    if (ep.keywordsCsv) {
      parts.push(tag("itunes:keywords", ep.keywordsCsv));
    }

    parts.push("</item>");
  });

  parts.push("</channel>");
  parts.push("</rss>");

  return parts.join("\n");
}

// Helpers
function tag(name, value) {
  return `<${name}>${escapeXml(value)}</${name}>`;
}

function escapeXml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function formatDuration(totalSeconds) {
  const sec = Math.max(0, Math.round(totalSeconds));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;

  if (h > 0) {
    return [h, m.toString().padStart(2, "0"), s.toString().padStart(2, "0")].join(
      ":"
    );
  }
  return [m, s.toString().padStart(2, "0")].join(":");
}
