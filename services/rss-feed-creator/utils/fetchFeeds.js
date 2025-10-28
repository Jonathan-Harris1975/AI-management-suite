// ─────────────────────────────────────────────
// ENV CONFIG (extended)
// ─────────────────────────────────────────────
const MAX_ITEMS_PER_FEED = Number(process.env.MAX_ITEMS_PER_FEED) || 10;
const MAX_RSS_FEEDS_PER_RUN = Number(process.env.MAX_RSS_FEEDS_PER_RUN) || 5;
const MAX_URL_FEEDS_PER_RUN = Number(process.env.MAX_URL_FEEDS_PER_RUN) || 1;
const FEED_CUTOFF_HOURS = Number(process.env.FEED_CUTOFF_HOURS) || 1440; // 60 days
const FEED_CUTOFF_MS = FEED_CUTOFF_HOURS * 60 * 60 * 1000;

// ─────────────────────────────────────────────
// MAIN FETCH FUNCTION
// ─────────────────────────────────────────────
export async function fetchFeeds() {
  const rssFeedsText = await readLocalOrR2File("rss-feeds.txt");
  const urlFeedsText = await readLocalOrR2File("url-feeds.txt");

  const rssFeeds = parseUrlList(rssFeedsText).slice(0, MAX_RSS_FEEDS_PER_RUN);
  const urlFeeds = parseUrlList(urlFeedsText).slice(0, MAX_URL_FEEDS_PER_RUN);

  if (rssFeeds.length === 0 && urlFeeds.length === 0)
    throw new Error("No feeds available");

  const selectedFeeds = [...rssFeeds, ...urlFeeds];
  info("rss.fetchFeeds.selection", {
    rssCount: rssFeeds.length,
    urlCount: urlFeeds.length,
    MAX_RSS_FEEDS_PER_RUN,
    MAX_URL_FEEDS_PER_RUN,
    MAX_ITEMS_PER_FEED,
    FEED_CUTOFF_HOURS,
  });

  const articles = [];
  const cutoffDate = Date.now() - FEED_CUTOFF_MS;

  for (const feedUrl of selectedFeeds) {
    try {
      const parsed = await parser.parseURL(feedUrl);
      const freshItems = (parsed.items || [])
        .filter((it) => {
          const date = new Date(it.pubDate || it.isoDate || 0).getTime();
          return !isNaN(date) && date >= cutoffDate;
        })
        .slice(0, MAX_ITEMS_PER_FEED);

      for (const item of freshItems) {
        articles.push({
          title: item.title,
          summary: item.contentSnippet || item.content || "",
          link: item.link,
          pubDate: item.pubDate,
          source: feedUrl,
        });
      }

      info("rss.fetchFeeds.success", {
        feedUrl,
        fetched: parsed.items?.length || 0,
        kept: freshItems.length,
      });
    } catch (err) {
      error("rss.fetchFeeds.fail", { feedUrl, err: err.message });
    }
  }

  info("📥 Fetch complete", { total: articles.length });
  return articles;
}
