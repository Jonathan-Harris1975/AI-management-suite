// /services/rss-feed-creator/index.js
import { uploadRssDataFiles } from "./bootstrap.js";
import { runRewritePipeline } from "./rewrite-pipeline.js";
import { log } from "#logger.js";

export async function startFeedCreator() {
  log.debug("rss.pipeline.start");

  // 1️⃣ Ensure feeds.txt + urls.txt are present in R2 before anything else
  await uploadRssDataFiles();

  // 2️⃣ Run rotation + rebuild
  return await runRewritePipeline();
}

export default startFeedCreator;
