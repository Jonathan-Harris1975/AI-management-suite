// services/script/utils/models.js
// Centralized model runners for intro / main / outro / compose
// Uses shared ai-service.js to handle model fallback + vendor routing

import { info, error } from "#logger.js";
import { resilientRequest } from "../../shared/utils/ai-service.js";
import {
  getIntroPrompt,
  getMainPrompt,
  getOutroPromptFull,
  validateScript,
  validateOutro,
} from "./promptTemplates.js";

import {
  extractAndParseJson,
  getTitleDescriptionPrompt,
  getSEOKeywordsPrompt,
  getArtworkPrompt,
} from "./podcastHelpers.js";

// Helper: run one LLM job with system/user prompts
async function runLLM({ label, prompt }) {
  try {
    info("script.llm.call", { label });
    const result = await resilientRequest({
      prompt,
      // ai-service.js handles:
      // - model priority / fallback chain
      // - temperature defaults / vendor routing
    });

    if (!result) return "";
    if (typeof result === "string") return result.trim();
    if (typeof result.text === "string") return result.text.trim();
    return JSON.stringify(result);
  } catch (err) {
    error("script.llm.fail", { label, err: err.message });
    throw err;
  }
}

// ─────────────────────────────────────────
// INTRO GENERATOR
// ─────────────────────────────────────────
export async function generateIntro({ weatherSummary, turingQuote }) {
  const prompt = getIntroPrompt({ weatherSummary, turingQuote });
  const raw = await runLLM({ label: "intro", prompt });
  return raw.trim();
}

// ─────────────────────────────────────────
// MAIN BODY GENERATOR
// ─────────────────────────────────────────
export async function generateMain({ articleTextArray = [], targetDuration = 60 }) {
  const prompt = getMainPrompt(articleTextArray, targetDuration);
  const raw = await runLLM({ label: "main", prompt });
  const validated = validateScript(raw);
  if (!validated.isValid) {
    error("script.main.validation", { violations: validated.violations });
  }
  return raw.trim();
}

// ─────────────────────────────────────────
// OUTRO GENERATOR
// ─────────────────────────────────────────
export async function generateOutro({ expectedCta, expectedTitle, expectedUrl }) {
  const prompt = await getOutroPromptFull();
  const raw = await runLLM({ label: "outro", prompt });
  const outroCheck = validateOutro(raw, expectedCta, expectedTitle, expectedUrl);
  if (!outroCheck.isValid) {
    error("script.outro.validation", { issues: outroCheck.issues });
  }
  return raw.trim();
}

// ─────────────────────────────────────────
// COMPOSER (FINAL EPISODE STITCH)
// ─────────────────────────────────────────
export async function generateComposedEpisode({
  introText = "",
  mainText = "",
  outroText = "",
}) {
  const compositePrompt = `
Combine the following podcast sections into one cohesive episode script.
Maintain a single, consistent British Gen X voice (Jonathan Harris style),
and ensure natural transitions between intro, main content, and outro.

--- INTRO ---
${introText}

--- MAIN ---
${mainText}

--- OUTRO ---
${outroText}

Output one continuous narrative. No section labels, no meta-commentary.
  `;
  const raw = await runLLM({ label: "compose", prompt: compositePrompt });
  return raw.trim();
}

// ─────────────────────────────────────────
// TITLE + DESCRIPTION GENERATOR
// ─────────────────────────────────────────
export async function generateTitleAndDescription({ transcript }) {
  const prompt = getTitleDescriptionPrompt(transcript);
  const raw = await resilientRequest({ prompt, temperature: 0.7 });
  const parsed = extractAndParseJson(raw);
  if (!parsed) {
    error("script.titledesc.parse.fail", { raw });
    return { title: "Untitled Episode", description: "No description available." };
  }
  return parsed;
}

// ─────────────────────────────────────────
// SEO KEYWORDS GENERATOR
// ─────────────────────────────────────────
export async function generateSEOKeywords({ description }) {
  const prompt = getSEOKeywordsPrompt(description);
  const raw = await resilientRequest({ prompt, temperature: 0.5 });
  return raw.trim().replace(/\s+/g, " ");
}

// ─────────────────────────────────────────
// ARTWORK PROMPT GENERATOR
// ─────────────────────────────────────────
export async function generateArtworkPrompt({ description }) {
  const prompt = getArtworkPrompt(description);
  const raw = await resilientRequest({ prompt, temperature: 0.5 });
  return raw.trim();
}
