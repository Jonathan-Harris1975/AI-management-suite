// services/rss-feed-creator/startup/rss-init.js
import { ensureR2Sources } from "../utils/rss-bootstrap.js";
import rssLogger from "../utils/rss-logger.js";
const { info, error } = rssLogger;

(async () => {
  try {
    info("🧠 RSS Init — Ensuring feeds and URLs exist in R2...");
    await ensureR2Sources();
    info("✅ RSS Init complete.");
  } catch (err) {
    error("💥 RSS Init failed", { err: err.message });
  }
})();
