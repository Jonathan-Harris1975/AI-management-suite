// services/rss-feed-creator/routes/rewrite.js
import express from "express";
import runRewritePipeline from "../rewrite-pipeline.js";
import { info, error } from "#logger.js";
import { ensureR2Sources, saveRotation } from "../utils/rss-bootstrap.js";
import { getObjectAsText } from "#shared/r2-client.js"; // use alias to avoid path drift

const router = express.Router();

// small helper
const isHttpLike = (s) => typeof s === "string" && /^https?:\/\//i.test(s);

router.post("/rewrite", async (req, res) => {
  try {
    let { feedXml, fileName, maxItemsPerFeed } = req.body || {};
    let selectedSource = null;

    // 1) If no body content, rotate and load from the configured sources
    if (!feedXml) {
      info("⚙️ No feedXml provided — fetching next RSS feed from R2 rotation...");

      const { bucket, feeds, rotation } = await ensureR2Sources();
      const index = Number(rotation?.lastIndex || 0);
      const nextIndex = feeds.length ? (index + 1) % feeds.length : 0;
      await saveRotation(nextIndex);

      selectedSource = feeds[index];
      info(`📡 Using feed [${index + 1}/${feeds.length}]: ${selectedSource}`);

      // (A) If it's an HTTP URL, download it
      if (isHttpLike(selectedSource)) {
        info("🌐 Downloading RSS feed from remote URL...");
        const resp = await fetch(selectedSource, {
          redirect: "follow",
          headers: {
            "user-agent":
              process.env.RSS_USER_AGENT ||
              "AI-Podcast-Suite/1.0 (+https://example.com)",
            accept: "application/rss+xml, application/xml, text/xml;q=0.8, */*;q=0.5",
          },
        });
        if (!resp.ok) {
          throw new Error(`Failed to fetch feed: ${selectedSource} — HTTP ${resp.status}`);
        }
        feedXml = await resp.text();
        info(`✅ Successfully downloaded feed: ${selectedSource}`);
      } else {
        // (B) Otherwise assume it's an R2 object key
        const r2Key = selectedSource.startsWith("data/")
          ? selectedSource
          : `data/${selectedSource}`;
        feedXml = await getObjectAsText(bucket, r2Key);
      }

      // Suggested filename based on source
      try {
        const host = isHttpLike(selectedSource)
          ? new URL(selectedSource).hostname
          : String(selectedSource).replace(/^data\//, "").replace(/\.[^.]+$/, "");
        fileName =
          fileName ||
          `rewritten-${host.replace(/[^a-z0-9.-]/gi, "_")}-${Date.now()}.xml`;
      } catch {
        fileName = fileName || `rewritten-${Date.now()}.xml`;
      }
    }

    if (typeof feedXml !== "string" || !feedXml.trim().startsWith("<")) {
      throw new Error("Missing or invalid 'feedXml' string (R2/URL source invalid or empty).");
    }

    // 2) Hand off to pipeline, with explicit constraints + fallback config
    info("📰 RSS rewrite requested");
    const result = await runRewritePipeline(feedXml, {
      fileName,
      maxItemsPerFeed: Number(process.env.MAX_ITEMS_PER_FEED || maxItemsPerFeed || 20),

      // hard constraints (also enforced post-generation)
      maxTitleWords: Number(process.env.RSS_MAX_TITLE_WORDS || 12),
      minBodyChars: Number(process.env.RSS_MIN_BODY_CHARS || 250),
      maxBodyChars: Number(process.env.RSS_MAX_BODY_CHARS || 600),

      // recent-window logic with fallback
      primaryWindowHours: Number(process.env.RSS_PRIMARY_WINDOW_HOURS || 24),
      fallbackWindowHours: Number(process.env.RSS_FALLBACK_WINDOW_HOURS || 72),
      takeLatestIfEmpty: process.env.RSS_TAKE_LATEST_IF_EMPTY !== "false", // default true

      // pass the chosen source for attribution/debug
      sourceUrl: isHttpLike(selectedSource) ? selectedSource : undefined,
    });

    // 3) Return the public URL emitted by the pipeline (what you want)
    res.status(200).json({ success: true, result });
  } catch (err) {
    error("💥 RSS rewrite failed", { message: err.message, stack: err.stack });
    res.status(500).json({
      success: false,
      error: err.message,
      stack: process.env.NODE_ENV !== "Production" ? err.stack : undefined,
    });
  }
});

export default router;
