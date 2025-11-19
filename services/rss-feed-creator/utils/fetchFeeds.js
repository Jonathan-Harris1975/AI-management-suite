// ============================================================
// 📰 Fetch Feeds Utility (PARSES items)
// ============================================================
// Rotates through rss-feeds.txt and url-feeds.txt, then fetches
// and parses each selected feed into article items.
// ============================================================

import Parser from "rss-parser";
import { info, error,debug} from "#logger.js";
import { loadRotationState, saveFeedRotation } from "./feedRotationManager.js";
import { readLocalOrR2File } from "./fileReader.js";

const parser = new Parser();

// Tunables
const MAX_RSS_FEEDS_PER_RUN = Number(process.env.MAX_RSS_FEEDS_PER_RUN) || 5;
const MAX_URL_FEEDS_PER_RUN = Number(process.env.MAX_URL_FEEDS_PER_RUN) || 1;
const MAX_ITEMS_PER_FEED = Number(process.env.MAX_ITEMS_PER_FEED) || 20; // safety cap
const FEED_CUTOFF_HOURS = Number(process.env.FEED_CUTOFF_HOURS) || 48; // default 48 hours

function parseList(raw = "") {
  return raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"));
}

function isWithinCutoff(pubDate) {
  try {
    const itemDate = new Date(pubDate);
    if (isNaN(itemDate.getTime())) return false;
    
    const now = new Date();
    const cutoffMs = FEED_CUTOFF_HOURS * 60 * 60 * 1000;
    const ageMs = now - itemDate;
    
    return ageMs <= cutoffMs && ageMs >= 0; // Also reject future dates
  } catch {
    return false;
  }
}

function toArticle(item) {
  // Map typical RSS fields → our internal article shape
  const title = item.title?.toString().trim() || "";
  const link = (item.link || item.guid || "").toString().trim();
  const summary =
    (item.contentSnippet || item.content || item.summary || item.description || "")
      .toString()
      .trim();

  let pubDate = item.isoDate || item.pubDate || item.date || "";
  try {
    const d = new Date(pubDate);
    if (!isNaN(d.getTime())) {
      pubDate = d.toISOString();
    } else {
      pubDate = new Date().toISOString();
    }
  } catch {
    pubDate = new Date().toISOString();
  }

  return { title, summary, link, pubDate };
}

async function fetchAndParseOne(url) {
  try {
    const feed = await parser.parseURL(url);
    const items = Array.isArray(feed.items) ? feed.items : [];
    const mapped = items.slice(0, MAX_ITEMS_PER_FEED).map(toArticle);

    // Filter out entries missing both title and summary
    const cleaned = mapped.filter((i) => i.title || i.summary);
    
    // Apply time window filter
    const withinCutoff = cleaned.filter((i) => isWithinCutoff(i.pubDate));
    
    const filtered = withinCutoff.length;
    const discarded = cleaned.length - filtered;

    debug ("rss.fetchFeeds.parsed", {
      url,
      count: filtered,
      sourceItems: items.length,
      discardedOld: discarded,
      cutoffHours: FEED_CUTOFF_HOURS,
    });

    return withinCutoff;
  } catch (err) {
    error("rss.fetchFeeds.parse.fail", { url, err: err.message });
    return [];
  }
}

export async function fetchAndParseFeeds() {
  // 1) Load feed URL lists (from local or R2)
  const rssFeedsText = await readLocalOrR2File("rss-feeds.txt");
  const urlFeedsText = await readLocalOrR2File("url-feeds.txt");

  const rssFeedsAll = parseList(rssFeedsText);
  const urlFeedsAll = parseList(urlFeedsText);

  if (rssFeedsAll.length === 0 && urlFeedsAll.length === 0) {
    throw new Error("No feeds available in rss-feeds.txt or url-feeds.txt");
  }

  // 2) Rotation state → pick the next batch
  const { rssIndex = 0, urlIndex = 0 } = await loadRotationState();

  const rssBatch = rssFeedsAll.slice(
    rssIndex,
    rssIndex + Math.min(MAX_RSS_FEEDS_PER_RUN, rssFeedsAll.length)
  );
  const urlBatch = urlFeedsAll.slice(
    urlIndex,
    urlIndex + Math.min(MAX_URL_FEEDS_PER_RUN, urlFeedsAll.length)
  );

  // 3) Advance rotation and persist
  const nextRssIndex =
    (rssIndex + Math.min(MAX_RSS_FEEDS_PER_RUN, Math.max(1, rssFeedsAll.length))) %
    Math.max(1, rssFeedsAll.length);
  const nextUrlIndex =
    (urlIndex + Math.min(MAX_URL_FEEDS_PER_RUN, Math.max(1, urlFeedsAll.length))) %
    Math.max(1, urlFeedsAll.length);

  await saveFeedRotation({ rssIndex: nextRssIndex, urlIndex: nextUrlIndex });

  const selected = [...rssBatch, ...urlBatch];
  debug("rss.fetchFeeds.rotation.enabled", {
    rssFeeds: rssBatch.length,
    urlFeeds: urlBatch.length,
    selected: selected.length,
    cutoffHours: FEED_CUTOFF_HOURS,
  });

  // 4) Parse each selected feed into article items
  const parsedLists = await Promise.all(selected.map(fetchAndParseOne));
  const items = parsedLists.flat();

  // 5) De-dupe by link (and then by title as a fallback)
  const seen = new Set();
  const deduped = [];
  for (const it of items) {
    const key = it.link || `title:${it.title}`;
    if (key && !seen.has(key)) {
      seen.add(key);
      deduped.push(it);
    }
  }

  debug("rss.fetchFeeds.items.ready", {
    parsedTotal: items.length,
    deduped: deduped.length,
    cutoffHours: FEED_CUTOFF_HOURS,
  });

  return deduped;
}

export default { fetchAndParseFeeds };
