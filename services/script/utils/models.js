// services/script/utils/models.js
// Centralised model runners for intro / main / outro
// Uses shared ai-service.js resilientRequest() for model routing / fallback

import { info, error } from "#logger.js";
import { resilientRequest } from "../../shared/utils/ai-service.js";
import {
  buildIntroPrompt,
  buildMainPrompt,
  buildOutroPrompt,
} from "./promptTemplates.js"; // ✅ actual file name
// NOTE: compose is handled by /script/compose using temp storage
// so we do NOT import or generate anything for compose here.

/**
 * Internal helper: run a single LLM job for a given section.
 * We pass a routeKey so ai-service.js can pick the correct model chain.
 *
 * @param {string} label   - "intro" | "main" | "outro"
 * @param {string} system  - system prompt text
 * @param {string} user    - user prompt text
 * @returns {Promise<string>} cleaned model text
 */
async function runSectionModel({ label, system, user }) {
  try {
    info("script.llm.call", { section: label });

    // resilientRequest signature (from shared/utils/ai-service.js):
    //    resilientRequest(routeKey, { system, prompt })
    //
    // Earlier log "No model route defined for: [object Object]"
    // happened because it was called with only an object.
    // We now pass the string label ("intro" | "main" | "outro")
    // as the first arg so ai-service can route to the right model.
    const raw = await resilientRequest(label, {
      system,
      prompt: user,
    });

    // ai-service normally returns either a string, or { text: "..." }
    if (!raw) return "";
    if (typeof raw === "string") return raw.trim();
    if (typeof raw.text === "string") return raw.text.trim();

    // fallback: stringify whatever came back
    return JSON.stringify(raw);
  } catch (err) {
    error("script.llm.fail", { section: label, err: err.message });
    throw new Error(err.message || "LLM call failed");
  }
}

/**
 * generateIntro
 * Builds the intro prompt and runs the "intro" model route.
 *
 * @param {Object} params
 * @param {string} params.topic
 * @param {string} params.date
 * @param {Object} [params.tone]
 * @returns {Promise<string>}
 */
export async function generateIntro({ topic, date, tone = {} }) {
  const { system, user } = buildIntroPrompt({ topic, date, tone });
  return runSectionModel({
    label: "intro",
    system,
    user,
  });
}

/**
 * generateMain
 * Builds main/body prompt and runs the "main" model route.
 *
 * @param {Object} params
 * @param {string} params.topic
 * @param {string[]} [params.talkingPoints]
 * @param {Object} [params.tone]
 * @returns {Promise<string>}
 */
export async function generateMain({ topic, talkingPoints = [], tone = {} }) {
  const { system, user } = buildMainPrompt({ topic, talkingPoints, tone });
  return runSectionModel({
    label: "main",
    system,
    user,
  });
}

/**
 * generateOutro
 * Builds outro prompt and runs the "outro" model route.
 *
 * @param {Object} params
 * @param {string} params.topic
 * @param {Object} [params.tone]
 * @returns {Promise<string>}
 */
export async function generateOutro({ topic, tone = {} }) {
  const { system, user } = buildOutroPrompt({ topic, tone });
  return runSectionModel({
    label: "outro",
    system,
    user,
  });
}

// keep default export object because other code may import models.js default
export default {
  generateIntro,
  generateMain,
  generateOutro,
};
