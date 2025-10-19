// /services/rss-feed-creator/utils/models.js
// 🧠 OpenRouter Model Orchestration (RSS Feed Creator)
// Clean ESM imports + resilient OpenRouter call

import { resilientRequest } from '../../shared/utils/ai-service.js';
import { aiConfig } from '../../shared/utils/ai-config.js';
import { info, error } from '../../shared/utils/logger.js';
import { RSS_PROMPTS } from "./rss-prompts.js";

/**
 * Rewrites a feed item using the newsletter-quality OpenRouter prompt
 * @param {Object} item - The RSS item with title and snippet
 * @returns {Promise<string>} rewritten text
 */
export async function rewriteTextLLM({ title, snippet }) {
  const prompt = RSS_PROMPTS.newsletterQuality({ title, snippet });
  const messages = [{ role: "user", content: prompt }];
  const out = await resilientRequest("rssRewrite", messages);
  return (out || "").trim();
}

// Backwards/forwards-compatible export names for the pipeline resolver:
export const runLLMRewrite = rewriteTextLLM;
export const rewriteFeed = rewriteTextLLM;
export default rewriteTextLLM;
