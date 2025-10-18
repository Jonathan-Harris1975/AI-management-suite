// /services/rss-feed-creator/index.js
import { runRewritePipeline } from "./rewrite-pipeline.js";

export async function startFeedCreator() {
  return await runRewritePipeline();
}

export default startFeedCreator;
