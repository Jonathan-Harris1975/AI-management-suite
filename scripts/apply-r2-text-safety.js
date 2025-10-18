// ============================================================
// 🧠 AI Podcast Suite — Safe Bootstrap + RSS Feed Rotation
// ============================================================
//
// 1) Rewrites unsafe getObject() calls → getObjectAsText()
// 2) Fixes bad alias imports (#shared/#routes/#services → correct relative paths)
// 3) Fixes absolute /app/shared/utils/* imports
// 4) Reads feeds.txt + urls.txt, rotates 5 feeds + 1 URL
// 5) Writes utils/active-feeds.json for build-rss.js
// 6) Persists index in utils/feed-state.json
// ============================================================

import fs from "fs";
import path from "path";
import { log } from "../utils/logger.js";

const projectRoot = "/app";
const dataDir = path.join(projectRoot, "services/rss-feed-creator/data");
const utilsDir = path.join(projectRoot, "services/rss-feed-creator/utils");
const stateFile = path.join(utilsDir, "feed-state.json");
const activeFile = path.join(utilsDir, "active-feeds.json");

// ------------------------------------------------------------
// 🧠 Step 1: Apply Safe R2 Patch + Import Alias Fixes
// ------------------------------------------------------------
function applySafeR2PatchAndAliasFix() {
  const processed = [];
  const aliasFixes = [];

  const patternImport = /getObject(?!AsText)/g;
  const patternCall = /(?<!AsText\b)getObject\(/g;

  const aliasPatterns = [
    // Shared utils
    { regex: /from\s+['"]#shared\/logger\.js['"]/g, replace: "from '../utils/logger.js'", desc: "#shared/logger.js alias fix" },
    { regex: /from\s+['"]#shared\/r2-client\.js['"]/g, replace: "from '../utils/r2-client.js'", desc: "#shared/r2-client.js alias fix" },
    { regex: /from\s+['"]#shared\/env\.js['"]/g, replace: "from '../utils/env.js'", desc: "#shared/env.js alias fix" },

    // Route aliases
    { regex: /from\s+['"]#routes\/rss-health\.js['"]/g, replace: "from '../../routes/rss-health.js'", desc: "#routes/rss-health.js alias fix" },
    { regex: /from\s+['"]#routes\/podcast-health\.js['"]/g, replace: "from '../../routes/podcast-health.js'", desc: "#routes/podcast-health.js alias fix" },
    { regex: /from\s+['"]#routes\/podcast\.js['"]/g, replace: "from '../../routes/podcast.js'", desc: "#routes/podcast.js alias fix" },
    { regex: /from\s+['"]#routes\/([^'"]+)['"]/g, replace: "from '../../routes/$1'", desc: "#routes/* generic alias fix" },

    // Service aliases
    { regex: /from\s+['"]#services\/rss-feed-creator\/rewrite-pipeline\.js['"]/g, replace: "from '../rss-feed-creator/rewrite-pipeline.js'", desc: "#services/rss-feed-creator alias fix" },
    { regex: /from\s+['"]#services\/podcast\/runPodcastPipeline\.js['"]/g, replace: "from '../podcast/runPodcastPipeline.js'", desc: "#services/podcast alias fix" },

    // Absolute /app fixes
    { regex: /from\s+['"]\/app\/shared\/utils\/logger\.js['"]/g, replace: "from '../utils/logger.js'", desc: "/app/shared/utils/logger.js absolute fix" },
    { regex: /from\s+['"]\/app\/shared\/utils\/r2-client\.js['"]/g, replace: "from '../utils/r2-client.js'", desc: "/app/shared/utils/r2-client.js absolute fix" }
  ];

  function walk(dir) {
    const entries = fs.readdirSync(dir);
    for (const name of entries) {
      const full = path.join(dir, name);
      const stat = fs.statSync(full);

      if (stat.isDirectory()) {
        if (full.includes("node_modules") || full.includes(".git") || full.includes("tmp")) continue;
        walk(full);
      } else if (name.endsWith(".js")) {
        let content = fs.readFileSync(full, "utf8");
        let updated = content;

        // Skip if already defines getObjectAsText
        if (!/function\s+getObjectAsText|export\s+async\s+function\s+getObjectAsText/.test(content)) {
          updated = updated
            .replace(patternImport, "getObjectAsText")
            .replace(patternCall, "getObjectAsText(");
        }

        // Apply alias/path fixes
        for (const { regex, replace, desc } of aliasPatterns) {
          if (regex.test(updated)) {
            updated = updated.replace(regex, replace);
            aliasFixes.push({ file: full, fix: desc });
          }
        }

        if (updated !== content) {
          fs.writeFileSync(full, updated, "utf8");
          processed.push(full);
        }
      }
    }
  }

  try {
    log.info("🧠 Applying R2 Safety Patch & Import Alias Fixes...");
    walk(projectRoot);

    if (processed.length > 0) {
      log.info(`✅ R2/Import patches applied to ${processed.length} files`);
    } else {
      log.info("✨ No R2 or import updates required.");
    }

    if (aliasFixes.length > 0) {
      log.info(`🔧 ${aliasFixes.length} alias mismatches fixed`);
      aliasFixes.slice(0, 10).forEach((f) =>
        log.info(`   → ${f.fix} in ${f.file}`)
      );
    } else {
      log.info("🔍 No alias mismatches found.");
    }
  } catch (err) {
    log.error("❌ Failed to apply R2 or alias fixes", { error: err.message });
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

    const feeds = fs.readFileSync(feedsPath, "utf-8")
      .split("\n").map((s) => s.trim()).filter(Boolean);
    const urls = fs.readFileSync(urlsPath, "utf-8")
      .split("\n").map((s) => s.trim()).filter(Boolean);

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
      totalFeeds: feeds.length
    };

    fs.writeFileSync(stateFile, JSON.stringify({ index: nextIndex }, null, 2));
    fs.writeFileSync(activeFile, JSON.stringify(activeData, null, 2));

    log.info("🔁 RSS Feed Rotation Complete", {
      feedsUsed: currentFeeds.length,
      nextIndex,
      currentUrl
    });
  } catch (err) {
    log.error("❌ RSS Feed Rotation failed", { error: err.message });
  }
}

// ------------------------------------------------------------
// 🚀 Execute Both
// ------------------------------------------------------------
try {
  applySafeR2PatchAndAliasFix();
  rotateFeeds();
} catch (err) {
  log.error("❌ Failed during bootstrap sequence", { error: err.message });
}
