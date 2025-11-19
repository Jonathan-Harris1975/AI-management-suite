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

  // Header
  parts.push(`<?xml version="1.0" encoding="UTF-8"?>`);
  parts.push(
    `<rss version="2.0"
  xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd"
  xmlns:podcast="https://podcastindex.org/namespace/1.0"
  xmlns:atom="http://www.w3.org/2005/Atom">`
  );
  parts.push(`<channel>`);

  // Channel fields
  if (title) parts.push(tag("title", title));
  if (link) parts.push(tag("link", link));
  if (description) parts.push(tag("description", description));
  if (language) parts.push(tag("language", language));
  if (copyright) parts.push(tag("copyright", copyright));

  // Self-link
  if (rssSelfLink) {
    parts.push(
      `<atom:link href="${escapeXml(
        rssSelfLink
      )}" rel="self" type="application/rss+xml" />`
    );
  }

  parts.push(tag("lastBuildDate", now));

  // iTunes show-level tags
  if (itunesAuthor) parts.push(tag("itunes:author", itunesAuthor));
  if (itunesExplicit) parts.push(tag("itunes:explicit", itunesExplicit));
  if (itunesType) parts.push(tag("itunes:type", itunesType));
  if (itunesKeywords) parts.push(tag("itunes:keywords", itunesKeywords));

  if (ownerName || ownerEmail) {
    parts.push("<itunes:owner>");
    if (ownerName) parts.push(tag("itunes:name", ownerName));
    if (ownerEmail) parts.push(tag("itunes:email", ownerEmail));
    parts.push("</itunes:owner>");
  }

  // Artwork
  if (imageUrl) {
    parts.push(`<itunes:image href="${escapeXml(imageUrl)}" />`);
  }

  // Categories
  categories.filter(Boolean).forEach((cat) => {
    parts.push(
      `<itunes:category text="${escapeXml(cat)}"></itunes:category>`
    );
  });

  // Podcasting 2.0 Funding Tag
  if (fundingUrl) {
    const txt = fundingText || "";
    parts.push(
      `<podcast:funding url="${escapeXml(
        fundingUrl
      )}">${escapeXml(txt)}</podcast:funding>`
    );
  }

  // Episodes
  items.forEach((ep) => {
    parts.push("<item>");

    if (ep.title) parts.push(tag("title", ep.title));
    if (ep.description) parts.push(tag("description", ep.description));
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
      parts.push(tag("itunes:duration", formatDuration(ep.durationSeconds)));
    }

    if (typeof ep.episodeNumber === "number") {
      parts.push(tag("itunes:episode", ep.episodeNumber));
    }

    if (ep.imageUrl) {
      parts.push(`<itunes:image href="${escapeXml(ep.imageUrl)}" />`);
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
    return [
      h,
      m.toString().padStart(2, "0"),
      s.toString().padStart(2, "0"),
    ].join(":");
  }

  return `${m}:${s.toString().padStart(2, "0")}`;
}
