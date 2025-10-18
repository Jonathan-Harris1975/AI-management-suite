// ============================================================
// 🧠 AI Podcast Suite — Safe Bootstrap + RSS Feed Rotation
// ============================================================
//
// 1) Ensures unsafe getObject() calls use getObjectAsText()
// 2) Reads feeds.txt + urls.txt, rotates 5 feeds + 1 URL
// 3) Writes utils/active-feeds.json for build-rss.js
// 4) Persists index in utils/feed-state.json
// ============================================================

import fs from "fs";
import path from "path";
import { log } from "#shared/logger.js";

const projectRoot = "/app";
const dataDir = path.join(projectRoot, "services/rss-feed-creator/data");
const utilsDir = path.join(projectRoot, "services/rss-feed-creator/utils");
const stateFile = path.join(utilsDir, "feed-state.json");
const activeFile = path.join(utilsDir, "active-feeds.json");

// ------------------------------------------------------------
// 🧠 Step 1: Apply Safe R2 Patch
// ------------------------------------------------------------
function applySafeR2Patch() {
  const processed = [];

  // ✅ Correct regex syntax — valid negative lookbehind in Node 22
  const patternImport = /getObject(?!AsText)/g;
  const patternCall = /(?<!AsText\b)getObject\(/g; // avoid already-correct calls

  function walk(dir) {
    const entries = fs.readdirSync(dir);
    for (const name of entries) {
      const full = path.join(dir, name);
      const stat = fs.statSync(full);

      if (stat.isDirectory()) {
        if (
          full.includes("node_modules") ||
          full.includes(".git") ||
          full.includes("tmp")
        )
          continue;
        walk(full);
      } else if (name.endsWith(".js")) {
        let content = fs.readFileSync(full, "utf8");

        // Skip if file already defines getObjectAsText
        if (
          /function\s+getObjectAsText|export\s+async\s+function\s+getObjectAsText/.test(
            content
          )
        )
          continue;

        const updated = content
          .replace(patternImport, "getObjectAsText")
          .replace(patternCall, "getObjectAsText(");

        if (updated !== content) {
          fs.writeFileSync(full, updated, "utf8");
          processed.push(full);
        }
      }
    }
  }

  try {
    log.info("🧠 Applying R2 Text Safety Patch (Safe Mode)...");
    walk(projectRoot);
    if (processed.length > 0) {
      log.info("✅ R2 Text Safety Patch applied to:", processed);
    } else {
      log.info("✨ No updates required — safe definitions already exist.");
    }
  } catch (err) {
    log.error("❌ Failed to apply R2 Text Safety Patch", { error: err.message });
  }
}

// ------------------------------------------------------------
// 🌀 Step 2: Feed Rotation Logic
// ------------------------------------------------------------
function rotateFeeds() {
  try {
    if (!fs.existsSync(utilsDir)) fs.mkdirSync(utilsDir, { recursive: true });

    const feedsPath = path.join(dataDir, "feeds.txt");
    const urlsPath = path.join(dataDir, "urls.txt");

    if (!fs.existsSync(feedsPath) || !fs.existsSync(urlsPath)) {
      log.error("❌ Missing feeds.txt or urls.txt in data directory");
      return;
    }

    const feeds = fs
      .readFileSync(feedsPath, "utf-8")
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
    const urls = fs
      .readFileSync(urlsPath, "utf-8")
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);

    const batchSize = 5;
    let state = { index: 0 };

    if (fs.existsSync(stateFile)) {
      try {
        state = JSON.parse(fs.readFileSync(stateFile, "utf-8"));
      } catch {
        state = { index: 0 };
      }
    }

    const start = state.index || 0;
    const end = Math.min(start + batchSize, feeds.length);
    const currentFeeds = feeds.slice(start, end);
    const urlIndex = Math.floor(start / batchSize) % Math.max(urls.length, 1);
    const currentUrl = urls[urlIndex];

    const nextIndex = end >= feeds.length ? 0 : end;

    const activeData = {
      feeds: currentFeeds,
      url: currentUrl,
      batchStart: start,
      batchEnd: end,
      totalFeeds: feeds.length,
    };

    fs.writeFileSync(stateFile, JSON.stringify({ index: nextIndex }, null, 2));
    fs.writeFileSync(activeFile, JSON.stringify(activeData, null, 2));

    log.info("🔁 RSS Feed Rotation Complete", {
      feedsUsed: currentFeeds.length,
      nextIndex,
      currentUrl,
    });
  } catch (err) {
    log.error("❌ RSS Feed Rotation failed", { error: err.message });
  }
}

// ------------------------------------------------------------
// 🚀 Execute Both
// ------------------------------------------------------------
try {
  applySafeR2Patch();
  rotateFeeds();
} catch (err) {
  log.error("❌ Failed during bootstrap sequence", { error: err.message });
}
