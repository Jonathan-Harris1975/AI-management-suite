// services/rss-feed-creator/rewrite-pipeline.js
// ============================================================
// 🔁 RSS Feed Rewrite / LLM Augmented Pipeline (Manual Trigger)
// ============================================================

import fs from "fs";
import fsp from "fs/promises";
import path from "path";
import fetch from "node-fetch";
import { info, warn, error } from "../shared/utils/logger.js";
import { putJson } from "../shared/utils/r2-client.js";

const projectRoot = "/app";
const baseDir = path.join(projectRoot, "services/rss-feed-creator");
const dataDir = path.join(baseDir, "data");
const utilsDir = path.join(baseDir, "utils");

const LOCAL_ACTIVE = path.join(utilsDir, "active-feeds.json");
const LOCAL_STATE  = path.join(utilsDir, "feed-state.json");

const R2_BUCKET =
  process.env.R2_BUCKET_RSS_FEEDS |
  

// ---- helpers ------------------------------------------------

async function resolveModelRewriter() {
  // Dynamically import to avoid hard-coding export names.
  const mod = await import("./utils/models.js");
  const candidates = [
    "runLLMRewrite",
    "rewriteTextLLM",
    "rewriteFeed",
    "rewrite",
    "callModel",
    "generateRewrite",
    "default",
  ];
  for (const key of candidates) {
    const fn = mod[key];
    if (typeof fn === "function") {
      return fn;
    }
  }
  throw new Error(
    "No suitable rewrite function exported by utils/models.js. Expected one of: " +
      candidates.join(", ")
  );
}

async function resolveShortener() {
  try {
    const mod = await import("./utils/shortio.js");
    const candidates = ["shortenURL", "shortenUrl", "shorten", "default"];
    for (const key of candidates) {
      const fn = mod[key];
      if (typeof fn === "function") return fn;
    }
  } catch (e) {
    // fallthrough
  }
  return async (u) => u; // no-op if not available
}

function xmlSafeSnippet(s = "") {
  // Keep the prompt payload modest; LLM should not receive raw XML blobs.
  return s
    .replace(/\s+/g, " ")
    .slice(0, 2000);
}

async function fetchText(url) {
  const res = await fetch(url, { timeout: 12000 });
  const text = await res.text();
  return text;
}

// ---- main ---------------------------------------------------

export async function rewriteRSSFeeds({ batchSize = 5 } = {}) {
  try {
    if (!fs.existsSync(utilsDir)) fs.mkdirSync(utilsDir, { recursive: true });

    const feedsPath = path.join(dataDir, "feeds.txt");
    const urlsPath  = path.join(dataDir, "urls.txt");

    if (!fs.existsSync(feedsPath) || !fs.existsSync(urlsPath)) {
      throw new Error("Missing feeds.txt or urls.txt in services/rss-feed-creator/data");
    }

    const feeds = (await fsp.readFile(feedsPath, "utf-8"))
      .split("\n").map(s => s.trim()).filter(Boolean);
    const urls  = (await fsp.readFile(urlsPath, "utf-8"))
      .split("\n").map(s => s.trim()).filter(Boolean);

    let state = { index: 0 };
    if (fs.existsSync(LOCAL_STATE)) {
      try { state = JSON.parse(await fsp.readFile(LOCAL_STATE, "utf-8")); }
      catch { state = { index: 0 }; }
    }

    const start = Number(state.index) || 0;
    const end   = Math.min(start + batchSize, feeds.length);
    const batch = feeds.slice(start, end);
    const urlIndex = Math.floor(start / batchSize) % Math.max(urls.length, 1);
    const targetUrl = urls[urlIndex];
    const nextIndex = end >= feeds.length ? 0 : end;

    // Resolve integrations
    const rewriteFn   = await resolveModelRewriter();
    const shortenFn   = await resolveShortener();
    info("🧠 RSS rewrite: integrations resolved", {
      modelResolver: rewriteFn.name || "anonymous",
      shortener: shortenFn.name || "noop",
      batchSize,
    });

    // Rewrite each feed URL via LLM (lightweight fetch -> snippet -> rewrite)
    const items = [];
    for (const originalUrl of batch) {
      try {
        const raw = await fetchText(originalUrl).catch(() => "");
        const snippet = xmlSafeSnippet(raw);
        // Try to derive a title-ish string from URL (fallback)
        const derivedTitle = originalUrl.split("/").filter(Boolean).slice(-1)[0] || "Source";

        // Many teams keep their own prompt builder; if your models.js expects a single string,
        // pass one; if it expects an object, this adapter still works (common signatures tried below).
        let summary;
        try {
          // Try common signatures without breaking:
          summary =
            (await rewriteFn({ title: derivedTitle, description: snippet, source: originalUrl })) ||
            (await rewriteFn(derivedTitle, snippet, originalUrl)) ||
            (await rewriteFn(snippet));
        } catch (inner) {
          throw inner;
        }

        const shortUrl = await shortenFn(originalUrl).catch(() => originalUrl);

        items.push({
          original: originalUrl,
          shortUrl,
          title: derivedTitle,
          summary: typeof summary === "string" ? summary.trim() : String(summary ?? "").trim(),
        });
      } catch (err) {
        warn("⚠️ Feed item rewrite failed; pushing fallback", {
          originalUrl,
          error: err?.message || String(err),
        });
        items.push({
          original: originalUrl,
          shortUrl: originalUrl,
          title: "Source",
          summary: "Rewrite failed for this item.",
        });
      }
    }

    // Local previews/state (kept for dev visibility & backward-compat)
    const manifest = {
      generatedAt: new Date().toISOString(),
      targetUrl,
      // Backward-compat for older builder code:
      feeds: batch,                 // raw URL list
      // New, richer structure the builder can use:
      items,                        // rewritten items
      meta: { batchStart: start, batchEnd: end, totalFeeds: feeds.length },
    };

    await fsp.writeFile(LOCAL_STATE, JSON.stringify({ index: nextIndex }, null, 2));
    await fsp.writeFile(LOCAL_ACTIVE, JSON.stringify(manifest, null, 2));

    if (!R2_BUCKET) throw new Error("No R2 bucket configured (R2_BUCKET_RSS_FEEDS / R2_BUCKET_META)");
    const manifestKey = "rewritten/latest-feeds.json";
    await putJson(R2_BUCKET, manifestKey, manifest);

    info("🔁 RSS rewrite + LLM summaries complete", {
      rewrittenCount: items.length,
      batchSize,
      nextIndex,
      r2Bucket: R2_BUCKET,
      r2Key: manifestKey,
    });

    return {
      ok: true,
      rewrittenCount: items.length,
      nextIndex,
      r2Bucket: R2_BUCKET,
      r2Key: manifestKey,
    };
  } catch (err) {
    error("❌ RSS rewrite pipeline failed", { error: err.message });
    throw err;
  }
}

export default rewriteRSSFeeds;
