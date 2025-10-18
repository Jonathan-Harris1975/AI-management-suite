// ============================================================
// 🧠 RSS Feed Creator — Bootstrap
// ============================================================
//
// - Uploads data files (feeds.txt, urls.txt) to R2 if present
// - Uploads rotation artifacts (active-feeds.json, feed-state.json)
// - Exported: uploadRssDataFiles()
// ============================================================

import fs from "fs";
import path from "path";
import { log } from "#shared/logger.js";
import {
  R2_BUCKETS,
  uploadFileToR2,
  putJson,
} from "#shared/r2-client.js";

const projectRoot = "/app";
const dataDir = path.join(projectRoot, "services/rss-feed-creator/data");
const utilsDir = path.join(projectRoot, "services/rss-feed-creator/utils");

const feedsTxt = path.join(dataDir, "feeds.txt");
const urlsTxt = path.join(dataDir, "urls.txt");

const stateFile = path.join(utilsDir, "feed-state.json");
const activeFile = path.join(utilsDir, "active-feeds.json");

// Prefer dedicated RSS bucket; fall back to META
function resolveRssBucket() {
  return R2_BUCKETS.RSS_FEEDS || R2_BUCKETS.META;
}

export async function uploadRssDataFiles() {
  const bucket = resolveRssBucket();
  if (!bucket) {
    log.warn("rss.bootstrap.nobucket", { hint: "Set R2_BUCKET_RSS_FEEDS or R2_BUCKET_META" });
    return;
  }

  try {
    // 1) Static inputs (if present)
    const dataUploads = [
      { path: feedsTxt, key: "data/feeds.txt", contentType: "text/plain; charset=utf-8" },
      { path: urlsTxt,  key: "data/urls.txt",  contentType: "text/plain; charset=utf-8" },
    ];

    for (const f of dataUploads) {
      if (!fs.existsSync(f.path)) continue;
      const content = fs.readFileSync(f.path, "utf-8");
      await uploadFileToR2(bucket, f.key, content, f.contentType);
      log.info("rss.bootstrap.uploaded", { bucket, key: f.key });
    }

    // 2) Rotation artifacts (these should exist after rotation step)
    if (fs.existsSync(activeFile)) {
      const data = JSON.parse(fs.readFileSync(activeFile, "utf-8"));
      await putJson(bucket, "utils/active-feeds.json", data);
      log.info("rss.bootstrap.uploaded", { bucket, key: "utils/active-feeds.json" });
    }

    if (fs.existsSync(stateFile)) {
      const data = JSON.parse(fs.readFileSync(stateFile, "utf-8"));
      await putJson(bucket, "utils/feed-state.json", data);
      log.info("rss.bootstrap.uploaded", { bucket, key: "utils/feed-state.json" });
    }

    log.info("rss.bootstrap.complete", { bucket });
  } catch (err) {
    log.error("rss.bootstrap.fail", { error: err.message });
  }
}
