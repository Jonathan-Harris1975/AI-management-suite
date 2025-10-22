import { resilientRequest } from '../../shared/utils/ai-service.js';
import { RSS_PROMPTS } from './rss-prompts.js';

// Return a structured object so the pipeline can use title/body
export async function rewriteTextLLM({
  title,
  snippet,
  minLength = 250,
  maxLength = 750,
  tone = 'informative',
}) {
  // You can thread min/max/tone into the prompt if desired:
  const prompt = RSS_PROMPTS.newsletterQuality({ title, snippet, minLength, maxLength, tone });
  const messages = [{ role: 'user', content: prompt }];

  const out = await resilientRequest('rssRewrite', messages);
  const text = (out || '').trim();

  // Heuristic: derive a reasonable short title; keep full content as body
  const firstLine = text.split(/\n|\.|!|\?/).find(Boolean) || title || 'Rewritten Article';
  const safeTitle = firstLine.trim().slice(0, 120);

  return { title: safeTitle, body: text };
}

export const runLLMRewrite = rewriteTextLLM;
export const rewriteFeed = rewriteTextLLM;
export function resolveModelRewriter() {
  return rewriteTextLLM;
}
export default rewriteTextLLM;
