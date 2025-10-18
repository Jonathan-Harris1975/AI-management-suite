// /services/rss-feed-creator/utils/models.js
// 🧠 OpenRouter Model Orchestration (RSS Feed Creator)
// Version: 2025-10-13
- import { callOpenRouter } from '/app/services/shared/utils/ai-service.js';
- import { AI_MODELS, OPENROUTER_BASE_URL } from '/app/services/shared/utils/ai-config.js';
- import { log } from '/app/services/shared/utils/logger.js';
+ import { callOpenRouter } from '../../shared/utils/ai-service.js';
+ import { AI_MODELS, OPENROUTER_BASE_URL } from '../../shared/utils/ai-config.js';
+ import { log } from '../../shared/utils/logger.js';
import { RSS_PROMPTS } from "./rss-prompts.js";

/**
 * Rewrites a feed item using the newsletter-quality OpenRouter prompt
 * @param {Object} item - The RSS item with title and snippet
 * @returns {Promise<string>} rewritten text
 */
export async function rewriteItemWithModel({ title, snippet }) {
  const prompt = RSS_PROMPTS.newsletterQuality({ title, snippet });
  const response = await callOpenRouterModel(prompt);
  return response?.trim();
}
