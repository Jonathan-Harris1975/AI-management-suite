// services/rss-feed-creator/index.js
import { isAIRelevant } from "./utils/filterAIContent.js";

export async function processFeedItems(items, logger) {
  const output = [];

  for (const item of items) {
    const ok = await isAIRelevant(item);

    if (!ok) {
      logger?.info?.(`🛑 Skipping non-AI article: ${item.title}`);
      continue;
    }

    output.push(item);
  }

  return output;
}
