// services/script/utils/models.js
// Centralized model runners for intro / main / outro / composed
// Uses shared ai-service.js for model fallback + vendor routing

import { info, error } from "#logger.js";
import { resilientRequest } from "../../shared/utils/ai-service.js";
import promptTemplates from "./promptTemplates.js";
import {
  extractAndParseJson,
  getTitleDescriptionPrompt,
  getSEOKeywordsPrompt,
  getArtworkPrompt,
} from "./podcastHelpers.js";

// Destructure the helpers from promptTemplates.js
const {
  getIntroPrompt,
  getMainPrompt,
  getOutroPromptFull,
  humanize,
  enforceTransitions,
  validateScript,
  validateOutro,
} = promptTemplates;

// ────────────────────────────────────────────────
// Helper: call LLM using route name + {system,user}
// ────────────────────────────────────────────────
async function runLLM(routeName, promptPack = {}) {
  const { system = "", user = "" } = promptPack;
  const messages = [
    { role: "system", content: system },
    { role: "user", content: user },
  ];

  info("script.llm.call", { routeName });

  const raw = await resilientRequest(routeName, messages);
  if (!raw || typeof raw !== "string") throw new Error(`Empty LLM response for ${routeName}`);
  return raw.trim();
}

// ────────────────────────────────────────────────
// INTRO GENERATOR
// ────────────────────────────────────────────────
export async function generateIntro({ date, tone = {} } = {}) {
  try {
    const { system, user } = getIntroPrompt({ date, vibe: tone.vibe });
    const raw = await runLLM("intro", { system, user });
    let cleaned = humanize(raw);
    cleaned = enforceTransitions(cleaned);
    return cleaned.trim();
  } catch (err) {
    error("script.intro.fail", { err: err.message });
    throw err;
  }
}

// ────────────────────────────────────────────────
// MAIN BODY GENERATOR
// ────────────────────────────────────────────────
export async function generateMain({ date, newsItems = [], tone = {} } = {}) {
  try {
    const { system, user } = getMainPrompt({ date, newsItems, vibe: tone.vibe });
    const raw = await runLLM("main", { system, user });
    let cleaned = validateScript(raw);
    cleaned = humanize(cleaned);
    cleaned = enforceTransitions(cleaned);
    return cleaned.trim();
  } catch (err) {
    error("script.main.fail", { err: err.message });
    throw err;
  }
}

// ────────────────────────────────────────────────
// OUTRO GENERATOR
// ────────────────────────────────────────────────
export async function generateOutro({
  date,
  episodeTitle,
  siteUrl,
  expectedCta,
  tone = {},
} = {}) {
  try {
    const { system, user } = getOutroPromptFull({ date, vibe: tone.vibe, siteUrl });
    const raw = await runLLM("outro", { system, user });
    let cleaned = validateOutro(raw, { expectedCta, episodeTitle, siteUrl });
    cleaned = humanize(cleaned);
    cleaned = enforceTransitions(cleaned);
    return cleaned.trim();
  } catch (err) {
    error("script.outro.fail", { err: err.message });
    throw err;
  }
}

// ────────────────────────────────────────────────
// COMPOSED EPISODE GENERATOR (NEW)
// ────────────────────────────────────────────────
export async function generateComposedEpisode({
  introText = "",
  mainText = "",
  outroText = "",
  tone = {},
} = {}) {
  try {
    info("script.compose.start");

    const composedText = `${introText}\n\n${mainText}\n\n${outroText}`.trim();

    // Generate metadata (title, description, SEO, artwork)
    const titlePrompt = getTitleDescriptionPrompt(composedText);
    const titleResponse = await resilientRequest("metadata", { prompt: titlePrompt });
    const parsedMeta = extractAndParseJson(titleResponse);

    const seoPrompt = getSEOKeywordsPrompt(parsedMeta?.description || composedText);
    const seoResponse = await resilientRequest("metadata", { prompt: seoPrompt });

    const artworkPrompt = getArtworkPrompt(parsedMeta?.description || composedText);
    const artResponse = await resilientRequest("metadata", { prompt: artworkPrompt });

    const metadata = {
      title: parsedMeta?.title || "Untitled Episode",
      description: parsedMeta?.description || "No description generated.",
      seoKeywords: typeof seoResponse === "string" ? seoResponse.trim() : JSON.stringify(seoResponse),
      artworkPrompt: typeof artResponse === "string" ? artResponse.trim() : JSON.stringify(artResponse),
    };

    info("script.compose.success", { title: metadata.title });
    return { composedText, metadata };
  } catch (err) {
    error("script.compose.fail", { err: err.message });
    throw err;
  }
}

export default {
  generateIntro,
  generateMain,
  generateOutro,
  generateComposedEpisode,
};
