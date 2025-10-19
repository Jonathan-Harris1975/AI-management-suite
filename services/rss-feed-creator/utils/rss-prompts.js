export const RSS_PROMPTS = {
  newsletterQuality: ({ title, snippet }) => {
    return `You are an expert editor. Rewrite the following RSS item to be concise, factual, and engaging.
Return ONLY the rewritten text, no JSON, no extra commentary.

Title: ${title || ''}
Snippet: ${snippet || ''}`.trim();
  },
};
