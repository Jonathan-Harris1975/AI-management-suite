import { isAIRelevant } from "./utils/filterAIContent.js";

export async function processFeedItems(items, logger) {
  const results = [];
  for (const item of items) {
    const ok = await isAIRelevant(item);
    if (!ok) {
      logger?.info?.(`🛑 Skipping non-AI article: ${item.title}`);
      continue;
    }
    results.push(item);
  }
  return results;
}
