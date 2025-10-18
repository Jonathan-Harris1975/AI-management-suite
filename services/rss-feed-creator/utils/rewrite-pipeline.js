// ============================================================
// 🧠 RSS Feed Creator — Rewrite Pipeline
// ============================================================

import { log } from "#shared/logger.js";
import { uploadRssDataFiles } from "./bootstrap.js";
import { buildRssFeed } from "./build-rss.js"; // ensure build-rss exports buildRssFeed()

export async function runRewritePipeline() {
  log.info("rewrite.pipeline.start");

  try {
    // Ensure bootstrap artifacts are present in R2
    await uploadRssDataFiles();

    // Build the RSS from the active-feeds.json + url
    const { xml, key } = await buildRssFeed();
    log.info("rewrite.pipeline.complete", { key, size: xml?.length });
    return { ok: true, key };
  } catch (err) {
    log.error("rewrite.pipeline.fail", { error: err.message });
    throw err;
  }
}
