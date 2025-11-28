import { resilientRequest } from "../../shared/utils/resilientRequest.js";

const AI_KEYWORDS = [
  "artificial intelligence", " ai ", "machine learning", "ml ",
  "deep learning", "neural network", "llm", "large language model",
  "chatgpt", "openai", "anthropic", "google ai", "meta ai",
  "generative ai", "gen ai", "transformer model", "ai ethics",
  "ai regulation", "ai safety"
];

export async function isAIRelevant({ title, description }) {
  const text = `${title}\n${description}`.toLowerCase();
  const keywordMatch = AI_KEYWORDS.some(k => text.includes(k));
  if (!keywordMatch) return false;

  const titleSafe = title.toLowerCase().split(" ").some(
    w => description.toLowerCase().includes(w)
  );
  if (!titleSafe) return false;

  const classifierPrompt = `
    Is this article mainly about artificial intelligence?
    Answer with only: yes or no.

    Article:
    ${description.slice(0, 2000)}
  `;

  const verdict = await resilientRequest(classifierPrompt, "classifier");
  return verdict.trim().toLowerCase() === "yes";
}
