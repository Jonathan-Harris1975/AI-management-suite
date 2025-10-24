// services/script/utils/models.js
// Centralized model runners for intro / main / outro / compose
// Uses shared ai-service.js to handle model fallback + vendor routing

import { info, error } from "#logger.js";
import { callAI } from "../../shared/utils/ai-service.js";
import {
  buildIntroPrompt,
  buildMainPrompt,
  buildOutroPrompt,
  buildComposePrompt,
} from "./promptTemplates.js";

import {
  extractAndParseJson,
  getTitleDescriptionPrompt,
  getSEOKeywordsPrompt,
  getArtworkPrompt
} from "./podcastHelpers.js";

// helper: run one LLM job with system/user prompts
async function runLLM({ label, system, user }) {
  try {
    info("script.llm.call", { label });
    const result = await callAI({
      system,
      prompt: user,
      // ai-service.js handles model priority, temperature, and vendor routing
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
export async function generateIntro({ topic, date, tone = {} }) {
  const { system, user } = buildIntroPrompt({ topic, date, tone });
  const raw = await runLLM({ label: "intro", system, user });
  return raw.trim();
}

// ─────────────────────────────────────────
// MAIN BODY GENERATOR
// ─────────────────────────────────────────
export async function generateMain({ topic, talkingPoints = [], tone = {} }) {
  const { system, user } = buildMainPrompt({ topic, talkingPoints, tone });
  const raw = await runLLM({ label: "main", system, user });
  return raw.trim();
}

// ─────────────────────────────────────────
// OUTRO GENERATOR
// ─────────────────────────────────────────
export async function generateOutro({ topic, tone = {} }) {
  const { system, user } = buildOutroPrompt({ topic, tone });
  const raw = await runLLM({ label: "outro", system, user });
  return raw.trim();
}

// ─────────────────────────────────────────
// COMPOSER (FINAL EPISODE SCRIPT STITCH)
// ─────────────────────────────────────────
export async function generateComposedEpisode({
  introText = "",
  mainText = "",
  outroText = "",
  tone = {},
}) {
  const { system, user } = buildComposePrompt({
    introText,
    mainText,
    outroText,
    tone,
  });

  const raw = await runLLM({ label: "compose", system, user });
  return raw.trim();
}

// ─────────────────────────────────────────
// TITLE + DESCRIPTION GENERATOR
// ─────────────────────────────────────────
export async function generateTitleAndDescription({ transcript }) {
  const prompt = getTitleDescriptionPrompt(transcript);
  const raw = await callAI({ prompt, temperature: 0.7 });
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
  const raw = await callAI({ prompt, temperature: 0.5 });
  return raw.trim().replace(/\s+/g, " ");
}

// ─────────────────────────────────────────
// ARTWORK PROMPT GENERATOR
// ─────────────────────────────────────────
export async function generateArtworkPrompt({ description }) {
  const prompt = getArtworkPrompt(description);
  const raw = await callAI({ prompt, temperature: 0.5 });
  return raw.trim();
}
