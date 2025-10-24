// services/script/utils/models.js
// Centralised model runners for intro / main / outro / compose
// Uses shared ai-service.js with resilientRequest() for OpenRouter model handling

import { info, error } from "#logger.js";
import { resilientRequest } from "../../shared/utils/ai-service.js";
import {
  buildIntroPrompt,
  buildMainPrompt,
  buildOutroPrompt,
  buildComposePrompt,
} from "./promptTemplates.js";
import { applyPodcastStyleHints } from "./podcastHelpers.js";

/**
 * Wrapper for resilientRequest with consistent logging and fallback handling.
 * @param {string} label - Section label ("intro", "main", "outro", "compose")
 * @param {object} param1 - { system, user, routeKey }
 * @returns {Promise<string>}
 */
async function runModel({ label, system, user, routeKey }) {
  try {
    info("script.llm.call", { label, routeKey });

    const response = await resilientRequest({
      system,
      prompt: user,
      routeKey, // OpenRouter route key defined in ai-config.js
    });

    if (!response) return "";
    if (typeof response === "string") return response.trim();
    if (typeof response.text === "string") return response.text.trim();
    if (response.output && typeof response.output === "string") return response.output.trim();

    // fallback: stringify object if unknown structure
    return JSON.stringify(response);
  } catch (err) {
    error("script.llm.fail", { label, err: err.message });
    throw new Error(`Model request failed for ${label}: ${err.message}`);
  }
}

// ──────────────────────────────────────────────
// INTRO GENERATOR
// ──────────────────────────────────────────────
export async function generateIntro({ topic, date, tone = {} }) {
  const { system, user } = buildIntroPrompt({ topic, date, tone });
  const raw = await runModel({
    label: "intro",
    system,
    user,
    routeKey: "openrouter", // same model group as RSS Feed Creator
  });
  return applyPodcastStyleHints(raw, { section: "intro", topic, tone });
}

// ──────────────────────────────────────────────
// MAIN BODY GENERATOR
// ──────────────────────────────────────────────
export async function generateMain({ topic, talkingPoints = [], tone = {} }) {
  const { system, user } = buildMainPrompt({ topic, talkingPoints, tone });
  const raw = await runModel({
    label: "main",
    system,
    user,
    routeKey: "openrouter",
  });
  return applyPodcastStyleHints(raw, { section: "main", topic, tone });
}

// ──────────────────────────────────────────────
// OUTRO GENERATOR
// ──────────────────────────────────────────────
export async function generateOutro({ topic, tone = {} }) {
  const { system, user } = buildOutroPrompt({ topic, tone });
  const raw = await runModel({
    label: "outro",
    system,
    user,
    routeKey: "openrouter",
  });
  return applyPodcastStyleHints(raw, { section: "outro", topic, tone });
}

// ──────────────────────────────────────────────
// COMPOSER (FINAL STITCH)
// ──────────────────────────────────────────────
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

  const raw = await runModel({
    label: "compose",
    system,
    user,
    routeKey: "openrouter",
  });
  return applyPodcastStyleHints(raw, { section: "compose", tone });
}

export default {
  generateIntro,
  generateMain,
  generateOutro,
  generateComposedEpisode,
};
