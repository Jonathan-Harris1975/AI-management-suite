// services/rss-feed-creator/routes/rewrite.js
import express from "express";
import { info, error } from "../../shared/utils/logger.js";
import { ensureR2Sources, saveRotation } from "../utils/rss-bootstrap.js";
import { rewriteRSSFeeds } from "../rewrite-pipeline.js";

// Use global fetch (Node 18+). Fallback to node-fetch only if needed.
let fetchFn = globalThis.fetch;
if (typeof fetchFn !== "function") {
  const mod = await import("node-fetch");
  fetchFn = mod.default;
}

const router = express.Router();

const MAX_FEEDS_PER_RUN = Number(process.env.MAX_FEEDS_PER_RUN || 5);
const MAX_ITEMS_PER_FEED = Number(process.env.MAX_ITEMS_PER_FEED || 20);
const R2_PUBLIC_BASE_URL = process.env.R2_PUBLIC_BASE_URL_RSS || "";

async function fetchXml(url) {
  const res = await fetchFn(url, { redirect: "follow" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const text = await res.text();
  // If something like JSON/HTML slipped through, just return as-is — pipeline will validate.
  return text;
}

router.post("/rewrite", async (req, res) => {
  try {
    info("📰 RSS rewrite requested", { batchSize: MAX_FEEDS_PER_RUN });

    // Bootstrap: ensure sources + rotation exist in flat R2
    const { feeds, urls, rotation } = await ensureR2Sources();

    const start = Number(rotation.lastIndex || 0);
    const selectedFeeds = [];
    if (feeds.length) {
      // rotate feeds (wrap around)
      for (let i = 0; i < Math.min(MAX_FEEDS_PER_RUN, feeds.length); i++) {
        selectedFeeds.push(feeds[(start + i) % feeds.length]);
      }
    }
    const selectedUrl = urls.length ? urls[start % urls.length] : null;

    info("🔁 Rotation selection", {
      start,
      selectedFeeds: selectedFeeds.length,
      selectedUrl: Boolean(selectedUrl),
    });

    const sources = [...selectedFeeds, ...(selectedUrl ? [selectedUrl] : [])];
    if (!sources.length) {
      return res.status(400).json({ success: false, error: "No source URLs available" });
    }

    // Fetch -> rewrite
    let allItems = [];
    const perSourceErrors = [];

    for (const u of sources) {
      try {
        const xml = await fetchXml(u);
        // Pipeline returns items only when returnItemsOnly=true
        const result = await rewriteRSSFeeds(xml, {
          maxItemsPerFeed: MAX_ITEMS_PER_FEED,
          returnItemsOnly: true,
        });
        allItems = allItems.concat(result.items || []);
      } catch (e) {
        perSourceErrors.push({ url: u, error: e.message });
        error("⚠️ Source processing failed", { url: u, err: e.message });
      }
    }

    if (!allItems.length) {
      return res
        .status(500)
        .json({ success: false, error: "No items rewritten from any source", perSourceErrors });
    }

    // Build and upload final merged feed via pipeline’s full write
    const final = await rewriteRSSFeeds(
      // Build a minimal feed shell so pipeline can produce final merged XML
      `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>Merged</title></channel></rss>`,
      { returnItemsOnly: false } // this will create a new file and upload
    );

    // Advance rotation
    const nextIndex = (start + Math.min(MAX_FEEDS_PER_RUN, Math.max(1, feeds.length || 1))) % (feeds.length || 1);
    await saveRotation(nextIndex);

    return res.status(200).json({
      success: true,
      message: "RSS rewrite completed",
      feedsProcessed: sources.length,
      articlesRewritten: allItems.length,
      outputUrl: final.publicUrl || null,
      rotationIndex: nextIndex,
      perSourceErrors,
    });
  } catch (err) {
    error("💥 RSS Rewrite route failed", { error: err.message });
    return res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
