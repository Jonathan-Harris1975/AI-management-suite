// ============================================================
// 🧠 AI Podcast Suite — RSS Feed Rewrite Pipeline
// ============================================================
//
// Purpose:
//   • Loads utils/active-feeds.json from R2
//   • Rewrites feeds using simple AI placeholder logic
//   • Saves output to rewritten/latest-feeds.json
//   • Updates utils/last-success.log
//
// Dependencies:
//   • ../../shared/utils/r2-client.js
//   • ../../shared/utils/logger.js
// ============================================================

import { getObjectAsText, putJson, putText } from "../../shared/utils/r2-client.js";
import { log } from "../../shared/utils/logger.js";

// ------------------------------------------------------------
// ⚙️ Main Rewrite Pipeline
// ------------------------------------------------------------
export async function rewriteRSSFeeds() {
  log.info("🧠 Starting RSS Feed Rewrite Pipeline");

  try {
    const bucket = process.env.R2_BUCKET_RSS_FEEDS;
    const inputKey = "utils/active-feeds.json";
    const outputKey = "rewritten/latest-feeds.json";

    // 🧩 Load current active feeds
    const feedsText = await getObjectAsText(bucket, inputKey);
    if (!feedsText) throw new Error(`No feed data found at ${inputKey}`);

    const feeds = JSON.parse(feedsText);
    if (!feeds.feeds?.length) {
      throw new Error("No feeds available in active-feeds.json");
    }

    // 🧠 Perform rewrite (placeholder for AI transformation logic)
    const rewritten = feeds.feeds.map((feed) => ({
      original: feed,
      rewritten: `AI-enhanced summary of: ${feed}`,
    }));

    const result = {
      timestamp: new Date().toISOString(),
      feedsUsed: feeds.feeds.length,
      rewritten,
    };

    // 💾 Write new rewritten feeds
    await putJson(bucket, outputKey, result);
    await putText(bucket, "utils/last-success.log", `Success at ${new Date().toISOString()}`);

    log.info("✅ RSS Feed Rewrite Pipeline completed successfully", {
      feedsUsed: feeds.feeds.length,
      outputKey,
    });

    return result;
  } catch (err) {
    log.error("❌ RSS Feed Rewrite Pipeline failed", { error: err.message });
    throw err;
  }
}

// ------------------------------------------------------------
// 🧩 CLI entry point
// ------------------------------------------------------------
if (import.meta.url === `file://${process.argv[1]}`) {
  rewriteRSSFeeds()
    .then(() => log.info("🏁 RSS rewrite complete"))
    .catch((err) => {
      console.error("Rewrite pipeline failed:", err);
      process.exit(1);
    });
}
