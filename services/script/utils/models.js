// services/script/utils/models.js
// Centralised model runners for intro / main / outro / compose
// Uses shared ai-service.js to handle model fallback + vendor routing

import { info, error } from "#logger.js";
import { callAI } from "../../shared/utils/ai-service.js";
import {
  buildIntroPrompt,
  buildMainPrompt,
  buildOutroPrompt,
  buildComposePrompt,
} from "./promptTemplates.js";
import { applyPodcastStyleHints } from "./podcastHelper.js";

// helper: run one LLM job with system/user prompts
async function runLLM({ label, system, user }) {
  try {
    info("script.llm.call", { label });
    const result = await callAI({
      system,
      prompt: user,
      // ai-service.js already knows:
      // - model priority / fallback chain
      // - max tokens / temperature defaults
      // - vendor auth
    });

    // callAI is expected to return either { text } or a plain string.
    if (!result) return "";
    if (typeof result === "string") return result.trim();
    if (typeof result.text === "string") return result.text.trim();

    // last ditch stringify
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
  // give it light style polish (host voice, pacing rules, etc.)
  return applyPodcastStyleHints(raw, { section: "intro", topic, tone });
}

// ─────────────────────────────────────────
// MAIN BODY GENERATOR
// ─────────────────────────────────────────
export async function generateMain({ topic, talkingPoints = [], tone = {} }) {
  const { system, user } = buildMainPrompt({ topic, talkingPoints, tone });
  const raw = await runLLM({ label: "main", system, user });
  return applyPodcastStyleHints(raw, { section: "main", topic, tone });
}

// ─────────────────────────────────────────
// OUTRO GENERATOR
// ─────────────────────────────────────────
export async function generateOutro({ topic, tone = {} }) {
  const { system, user } = buildOutroPrompt({ topic, tone });
  const raw = await runLLM({ label: "outro", system, user });
  return applyPodcastStyleHints(raw, { section: "outro", topic, tone });
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

  // compose should produce final read-through script in broadcast order,
  // single speaker voice, no TODO notes.
  const raw = await runLLM({ label: "compose", system, user });
  return applyPodcastStyleHints(raw, { section: "compose", tone });
  }
