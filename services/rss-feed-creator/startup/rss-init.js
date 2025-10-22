// services/rss-feed-creator/startup/rss-init.js
import { ensureR2Sources } from "../utils/rss-bootstrap.js";
import { info, error } from "#logger.js";

/**
 * Runs RSS bootstrap automatically on startup
 */
export async function runRssBootstrap() {
  try {
    info("🚀 Running RSS data bootstrap (preload phase)...");
    const { feeds, urls, rotation } = await ensureR2Sources();
    info(
      `✅ RSS bootstrap complete: ${feeds.length} feeds, ${urls.length} urls, rotation index ${rotation.lastIndex}`
    );
  } catch (err) {
    error(`❌ RSS bootstrap failed: ${err.message}`);
  }
}
