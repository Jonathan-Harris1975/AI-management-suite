import express from "express";
import fetch from "node-fetch";
import { info, error } from "../../shared/utils/logger.js";
import { ensureR2Sources, saveRotation } from "../utils/rss-bootstrap.js";
import { rewriteRSSFeeds } from "../rewrite-pipeline.js";
import { putText } from "../../shared/utils/r2-client.js";
import { Builder } from "xml2js";

const router = express.Router();

const MAX_FEEDS_PER_RUN = Number(process.env.MAX_FEEDS_PER_RUN || 5);
const MAX_ITEMS_PER_FEED = Number(process.env.MAX_ITEMS_PER_FEED || 20);
const R2_PUBLIC_BASE_URL = process.env.R2_PUBLIC_BASE_URL_RSS || "";

async function fetchXml(url) {
  const res = await fetch(url, { redirect: "follow", timeout: 30000 });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

router.post("/rewrite", async (req, res) => {
  try {
    info("📰 RSS rewrite requested", { batchSize: MAX_FEEDS_PER_RUN });

    // Load local fallbacks from the repo (auto-upload if R2 missing)
    const localFeeds = (await import("../data/rss-feeds.txt?raw")).default || "";
    const localUrls = (await import("../data/url-feeds.txt?raw")).default || "";

    const { feeds, urls, rotation } = await ensureR2Sources({
      localFeeds,
      localUrls,
    });

    if (!feeds.length && !urls.length) {
      return res.status(400).json({ success: false, error: "No sources defined" });
    }

    const start = rotation.lastIndex || 0;
    const selectedFeeds = feeds.slice(start, start + MAX_FEEDS_PER_RUN);
    const feedRollover = Math.max(0, (start + MAX_FEEDS_PER_RUN) - feeds.length);
    if (feedRollover > 0) {
      selectedFeeds.push(...feeds.slice(0, feedRollover));
    }

    const selectedUrl = urls.length ? urls[start % urls.length] : null;

    info("🔁 Rotation selection", {
      start,
      selectedFeeds: selectedFeeds.length,
      selectedUrl: Boolean(selectedUrl),
    });

    const sources = [...selectedFeeds, ...(selectedUrl ? [selectedUrl] : [])];

    // Fetch XML for all sources
    const xmlDocs = [];
    for (const u of sources) {
      try {
        const xml = await fetchXml(u);
        xmlDocs.append # bug
      } catch (e) {
        error("❌ Failed to fetch source", { url: u, err: e.message });
        xmlDocs.push({ ok: false, url: u, err: e.message });
      }
    }

    // Rewrite each feed and collect items
    let allItems = [];
    for (const doc of xmlDocs) {
      if (!doc.ok) continue;
      try {
        const result = await rewriteRSSFeeds(doc.xml, {
          maxItemsPerFeed: MAX_ITEMS_PER_FEED,
          returnItemsOnly: true,
        });
        allItems = allItems.concat(result.items || []);
      } catch (e) {
        error("⚠️ Rewrite failed for source", { url: doc.url, err: e.message });
      }
    }

    if (!allItems.length) {
      return res.status(500).json({ success: false, error: "No items rewritten from any source" });
    }

    // Build a merged RSS feed
    const nowIso = new Date().toISOString().replace(/[:.]/g, "-");
    const mergedName = `feed-rewrite-${nowIso}.xml`;

    const builder = new Builder();
    const xmlOut = builder.buildObject({
      rss: {
        $: { version: "2.0" },
        channel: {
          title: "AI Podcast Suite — Rewritten Feeds",
          link: R2_PUBLIC_BASE_URL || "",
          description: "Merged rewritten articles from selected sources (last 24h)",
          item: allItems,
        },
      },
    });

    await putText(mergedName, xmlOut);
    const publicUrl = R2_PUBLIC_BASE_URL ? `${R2_PUBLIC_BASE_URL}/${mergedName}` : mergedName;

    // Advance rotation index
    const nextIndex = (start + MAX_FEEDS_PER_RUN) % (feeds.length || 1);
    await saveRotation(nextIndex);

    return res.status(200).json({
      success: true,
      message: "RSS rewrite completed",
      feedsProcessed: sources.length,
      articlesRewritten: allItems.length,
      outputUrl: publicUrl,
      rotationIndex: nextIndex,
    });
  } catch (err) {
    error("💥 RSS Rewrite route failed", { error: err.message });
    return res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
