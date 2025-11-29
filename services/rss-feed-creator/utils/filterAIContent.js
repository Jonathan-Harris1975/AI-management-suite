// services/rss-feed-creator/utils/filterAIContent.js
import { resilientRequest } from "../../shared/utils/ai-service.js";

const AI_KEYWORDS = [
  "artificial intelligence", " ai ", "machine learning", "ml ",
  "deep learning", "neural network", "llm", "large language model",
  "chatgpt", "openai", "anthropic", "google ai", "meta ai",
  "generative ai", "gen ai", "transformer model", "ai ethics",
  "ai regulation", "ai safety"
];

// -----------------------------------------------------
// 1) Fast keyword gate
// -----------------------------------------------------
function hasAIKeywords(title, description) {
  const text = `${title}\n${description}`.toLowerCase();
  return AI_KEYWORDS.some(k => text.includes(k));
}

// -----------------------------------------------------
// 2) Title/body mismatch filter
// -----------------------------------------------------
function titleMatchesBody(title, body) {
  const words = title.toLowerCase().split(/\s+/);
  return words.some(w => body.toLowerCase().includes(w));
}

// -----------------------------------------------------
// 3) Model-based classifier (using real resilientRequest)
// -----------------------------------------------------
async function llmRelevanceCheck(description) {
  const msg = [
    {
      role: "system",
      content:
        "You are a strict classifier. Determine if the article is primarily about artificial intelligence. Respond only with: yes or no.",
    },
    {
      role: "user",
      content: description.slice(0, 2000),
    },
  ];

  const res = await resilientRequest("rssRewrite", {
    sessionId: "ai-filter",
    section: "classifier",
    messages: msg,
    max_tokens: 5,
    temperature: 0.0,
  });

  return res.trim().toLowerCase() === "yes";
}

// -----------------------------------------------------
// MASTER FUNCTION
// -----------------------------------------------------
export async function isAIRelevant({ title, description }) {
  // 1) quick filter
  if (!hasAIKeywords(title, description)) return false;

  // 2) coarse semantic sanity check
  if (!titleMatchesBody(title, description)) return false;

  // 3) definitive AI-only verdict
  return await llmRelevanceCheck(description);
}
