// services/script/index.js
// Lightweight generators used by routes {intro, main, outro, compose}. No disk writes.

import { info, error } from "#logger.js";
import { resilientRequest } from "../shared/utils/ai-service.js";
import prompts from "./utils/promptTemplates.js";

/**
 * Helper: call LLM with a single user prompt. Returns plain text.
 */
async function callLLM(promptText, { model = process.env.OPENROUTER_MODEL, temperature = 0.4 } = {}) {
  const messages = [{ role: "user", content: promptText }];
  const result = await resilientRequest({
    provider: "openrouter",
    model,
    temperature,
    messages
  });
  const text = typeof result?.text === "string" ? result.text : (typeof result === "string" ? result : "");
  return String(text || "").trim();
}

export async function generateIntro({ sessionId, date, weatherSummary = "", turingQuote = "" }) {
  info("script.generateIntro", { sessionId, date });
  const prompt = prompts.getIntroPrompt({ weatherSummary, turingQuote });
  return { text: await callLLM(prompt, { temperature: 0.3 }) };
}

export async function generateMain({ sessionId, topic, articleTextArray = [], targetDuration = 12 }) {
  info("script.generateMain", { sessionId, topic, articles: articleTextArray.length, targetDuration });
  const prompt = prompts.getMainPrompt({ topic, articleTextArray, targetDuration });
  return { text: await callLLM(prompt, { temperature: 0.5 }) };
}

export async function generateOutro({ sessionId, topic, callsToAction = [] }) {
  info("script.generateOutro", { sessionId, topic, ctaCount: callsToAction.length });
  const prompt = prompts.getOutroPromptFull({ topic, callsToAction });
  return { text: await callLLM(prompt, { temperature: 0.35 }) };
}

// Kept for backwards compatibility if something imports default
export default {
  generateIntro,
  generateMain,
  generateOutro,
};
