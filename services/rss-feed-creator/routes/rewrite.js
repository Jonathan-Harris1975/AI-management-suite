// services/rss-feed-creator/routes/rewrite.js
import express from "express";
import runRewritePipeline from "../rewrite-pipeline.js";
import { info, error } from "#logger.js";
import { ensureR2Sources, saveRotation } from "../utils/rss-bootstrap.js";
import { getObjectAsText } from "#shared/r2-client.js";

const router = express.Router();

// simple url checker
const isHttpUrl = (s) => /^https?:\/\//i.test(String(s || ""));

router.post("/rewrite", async (req, res) => {
  try {
    let { feedXml, fileName, maxItemsPerFeed } = req.body || {};

    // If caller didn’t supply XML, pull the next source from rotation
    if (!feedXml) {
      info("⚙️ No feedXml provided — fetching next RSS feed from R2 rotation...");

      const { bucket, feeds, rotation } = await ensureR2Sources();
      const index = typeof rotation?.lastIndex === "number" ? rotation.lastIndex : 0;

      if (!feeds?.length) {
        throw new Error("No feeds available from ensureR2Sources().");
      }

      const nextIndex = (index + 1) % feeds.length;
      await saveRotation(nextIndex);

      const source = feeds[index];
      info(`📡 Using feed [${index + 1}/${feeds.length}]: ${source}`);

      // Fetch XML either from the web or from R2 depending on the source format
      if (isHttpUrl(source)) {
        info("🌐 Downloading RSS feed from remote URL...");
        const resp = await fetch(source, { redirect: "follow" });
        if (!resp.ok) {
          throw new Error(`Failed to download ${source}: HTTP ${resp.status}`);
        }
        feedXml = await resp.text();
      } else {
        // treat it as an object key inside the same R2 bucket
        feedXml = await getObjectAsText(bucket, source);
      }

      // Generate a stable file name from the source (host/path) + timestamp
      try {
        const u = new URL(source, "http://x/");
        const host = (u.host || "feed").replace(/[^a-z0-9.-]/gi, "_");
        fileName =
          fileName ||
          `rewritten-${host}-${new Date().toISOString().replace(/[:.]/g, "-")}.xml`;
      } catch {
        const safe = String(source).replace(/[^a-z0-9.-]/gi, "_");
        fileName =
          fileName ||
          `rewritten-${safe}-${new Date().toISOString().replace(/[:.]/g, "-")}.xml`;
      }
    }

    if (typeof feedXml !== "string" || !feedXml.trim().startsWith("<")) {
      throw new Error("Missing or invalid 'feedXml' string (download or R2 read returned empty).");
    }

    // Respect env override for items-per-feed
    const maxPerFeed = Number(
      maxItemsPerFeed ?? process.env.MAX_ITEMS_PER_FEED ?? 20
    );

    info("📰 RSS rewrite requested");
    const result = await runRewritePipeline(feedXml, {
      fileName,
      maxItemsPerFeed: maxPerFeed,
    });

    // runRewritePipeline already uploads to R2 and returns its metadata.
    // Ensure we pass back the publicUrl the pipeline computed.
    res.status(200).json({
      success: true,
      publicUrl: result?.publicUrl,
      key: result?.key,
      items: result?.items,
      meta: result?.meta,
    });
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
