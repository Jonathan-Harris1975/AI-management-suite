import { resilientRequest } from '../../shared/utils/ai-service.js';
import { info, error } from '#logger.js';
import { RSS_PROMPTS } from './rss-prompts.js';

export async function rewriteTextLLM({ title, snippet }) {
  const prompt = RSS_PROMPTS.newsletterQuality({ title, snippet });
  const messages = [{ role: 'user', content: prompt }];
  const out = await resilientRequest('rssRewrite', messages);
  return (out || '').trim();
}

export const runLLMRewrite = rewriteTextLLM;
export const rewriteFeed = rewriteTextLLM;
export function resolveModelRewriter() {
  return rewriteTextLLM;
}
export default rewriteTextLLM;
