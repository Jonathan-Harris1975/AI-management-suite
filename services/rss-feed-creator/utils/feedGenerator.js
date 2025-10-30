// /services/rss-feed-creator/utils/feedGenerator.js
// ✅ Final version - always serializes new batch, robust merge/dedupe/retention

import { buildRssXml, parseExistingRssXml } from "./rssBuilder.js";

/**
 * Make a best-effort normalized RSS item from various upstream shapes.
 * Supports shapes like: {title, link/url, description/summary, pubDate/datePublished/date, guid/id}
 */
function normalizeItem(raw) {
  if (!raw || typeof raw !== "object") return null;

  const title =
    raw.title ||
    raw.headline ||
    raw.name ||
    "";

  const link =
    raw.link ||
    raw.url ||
    raw.permalink ||
    "";

  const description =
    raw.description ||
    raw.summary ||
    raw.content ||
    raw.body ||
    "";

  const pubDate =
    raw.pubDate ||
    raw.datePublished ||
    raw.date ||
    raw.published ||
    (raw.isoDate || raw.updated) ||
    new Date().toUTCString();

  const guid =
    raw.guid ||
    raw.id ||
    raw.guid?.["#text"] || // some parsers give { guid: { "#text": "..." } }
    link ||
    `${title}-${pubDate}`;

  return {
    title: String(title).trim(),
    link: String(link).trim(),
    description: String(description).trim(),
    pubDate: new Date(pubDate).toString() === "Invalid Date"
      ? new Date().toUTCString()
      : new Date(pubDate).toUTCString(),
    guid: String(guid).trim(),
  };
}

/**
 * Remove duplicates by GUID → link → title+date key.
 */
function dedupeItems(items) {
  const seen = new Set();
  const result = [];

  for (const it of items) {
    if (!it) continue;
    const key = (it.guid || it.link || `${it.title}::${it.pubDate}`).toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(it);
  }
  return result;
}

/**
 * Applies retention by days and max length, keeping newest first.
 */
function applyRetention(items, { retentionDays = 60, maxItems = 500 }) {
  const now = Date.now();
  const cutoff = now - retentionDays * 24 * 60 * 60 * 1000;

  const filtered = items.filter((it) => {
    const t = Date.parse(it.pubDate);
    return Number.isFinite(t) ? t >= cutoff : true; // keep if no date
  });

  // Sort newest first
  filtered.sort((a, b) => Date.parse(b.pubDate) - Date.parse(a.pubDate));

  // Cap list
  return filtered.slice(0, maxItems);
}

/**
 * Load and parse existing feed.xml from R2.
 * Return normalized items array (possibly empty).
 */
async function loadExistingItems({ r2, bucket, feedKey }) {
  try {
    const xml = await r2.getObjectAsText(bucket, feedKey);
    if (!xml) return [];
    const { items } = parseExistingRssXml(xml);
    const normalized = (items || []).map(normalizeItem).filter(Boolean);
    return dedupeItems(normalized);
  } catch {
    return [];
  }
}

/**
 * Generate & save the RSS feed to R2.
 * CRITICAL: even if existing feed is empty/invalid, we still serialize the new batch.
 */
export async function generateAndSaveFeed({
  r2,              // your shared R2 client { getObjectAsText, uploadBuffer }
  bucket = "rss-feeds",
  feedKey = "feed.xml",
  meta = {},
  newItems = [],
  retentionDays = 60,
  maxItems = 500,
  logger = console,
}) {
  // Normalize new batch first
  const normalizedNew = (newItems || []).map(normalizeItem).filter(Boolean);

  // Load existing (best effort)
  const existing = await loadExistingItems({ r2, bucket, feedKey });

  // Merge: newest batch first (preferred), then existing
  let merged = dedupeItems([...normalizedNew, ...existing]);

  // Retention & cap
  merged = applyRetention(merged, { retentionDays, maxItems });

  logger.info?.("rss.feedGenerator.merge", {
    incoming: normalizedNew.length,
    existing: existing.length,
    merged: merged.length,
    retentionDays,
    maxItems,
  });

  // Build XML from merged (never empty unless literally no items at all)
  const xml = buildRssXml({ items: merged, meta });

  // Save
  const buf = Buffer.from(xml, "utf8");
  await r2.uploadBuffer(bucket, feedKey, buf);

  logger.info?.("rss.feedGenerator.save.success", {
    feedKey,
    totalItems: merged.length,
    newItems: normalizedNew.length,
    retentionDays,
    maxItems,
    size: buf.length,
  });

  return { totalItems: merged.length, newItems: normalizedNew.length, size: buf.length };
}
