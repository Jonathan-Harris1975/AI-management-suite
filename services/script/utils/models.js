// services/script/utils/models.js
// Centralized model runners for intro / main / outro
// Uses shared ai-service.js for model fallback + vendor routing

import { info, error } from "#logger.js";
import { resilientRequest } from "../../shared/utils/ai-service.js";
import promptTemplates from "./promptTemplates.js";

// Destructure the helpers from the default export in promptTemplates.js
const {
  getIntroPrompt,
  getMainPrompt,
  getOutroPromptFull,
  humanize,
  enforceTransitions,
  validateScript,
  validateOutro,
} = promptTemplates;

/**
 * Internal helper: call LLM for a given routeName using {system,user} prompts
 * @param {string} routeName - "intro" | "main" | "outro"
 * @param {object} promptPack - { system: string, user: string }
 * @returns {Promise<string>} cleaned model text
 */
async function runLLM(routeName, promptPack = {}) {
  const { system = "", user = "" } = promptPack;

  const messages = [
    { role: "system", content: system },
    { role: "user", content: user },
  ];

  info("script.llm.call", { routeName });

  const raw = await resilientRequest(routeName, messages);

  if (!raw || typeof raw !== "string") {
    throw new Error(`Empty or invalid LLM response for ${routeName}`);
  }

  return raw.trim();
}

/**
 * Generate the INTRO segment
 * @param {object} params
 * @param {string} params.date          - e.g. "2025-10-24"
 * @param {object} [params.tone]        - optional style hints { vibe?: string }
 * @returns {Promise<string>} finalIntroText
 */
export async function generateIntro({ date, tone = {} } = {}) {
  try {
    // build the prompts expected by the intro model
    const { system, user } = getIntroPrompt({
      date,
      vibe: tone.vibe, // if undefined, promptTemplates applies its own default vibe
    });

    const rawIntro = await runLLM("intro", { system, user });

    // post-process voice/pacing
    let cleaned = humanize(rawIntro);
    cleaned = enforceTransitions(cleaned);

    return cleaned.trim();
  } catch (err) {
    error("script.intro.fail", { err: err.message });
    throw err;
  }
}

/**
 * Generate the MAIN/BODY segment
 * @param {object} params
 * @param {string} params.date              - same date stamp as intro
 * @param {Array<string>} params.newsItems  - array of article summaries / bullets
 * @param {object} [params.tone]            - optional style hints { vibe?: string }
 * @returns {Promise<string>} finalMainText
 */
export async function generateMain({ date, newsItems = [], tone = {} } = {}) {
  try {
    const { system, user } = getMainPrompt({
      date,
      newsItems,
      vibe: tone.vibe,
    });

    const rawMain = await runLLM("main", { system, user });

    // clean, sanity check length/phrasing, then smooth it
    let cleaned = validateScript(rawMain);
    cleaned = humanize(cleaned);
    cleaned = enforceTransitions(cleaned);

    return cleaned.trim();
  } catch (err) {
    error("script.main.fail", { err: err.message });
    throw err;
  }
}

/**
 * Generate the OUTRO / CLOSING CTA
 * @param {object} params
 * @param {string} params.date                - date stamp
 * @param {string} [params.episodeTitle]      - human episode title for CTA context
 * @param {string} [params.siteUrl]           - canonical site URL / landing page
 * @param {string} [params.expectedCta]       - optional CTA override
 * @param {object} [params.tone]              - optional style hints { vibe?: string }
 * @returns {Promise<string>} finalOutroText
 */
export async function generateOutro({
  date,
  episodeTitle,
  siteUrl,
  expectedCta,
  tone = {},
} = {}) {
  try {
    const { system, user } = getOutroPromptFull({
      date,
      vibe: tone.vibe,
      siteUrl: siteUrl, // promptTemplates already has a default if this is undefined
    });

    const rawOutro = await runLLM("outro", { system, user });

    // enforce CTA / cleanup, then humanize tone and flow link
    let cleaned = validateOutro(rawOutro, {
      expectedCta,
      episodeTitle,
      siteUrl,
    });

    cleaned = humanize(cleaned);
    cleaned = enforceTransitions(cleaned);

    return cleaned.trim();
  } catch (err) {
    error("script.outro.fail", { err: err.message });
    throw err;
  }
}

// default export for convenience if something imports the whole module
export default {
  generateIntro,
  generateMain,
  generateOutro,
};
