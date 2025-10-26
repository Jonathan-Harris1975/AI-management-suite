// services/script/utils/models.js
import { info, error } from "#logger.js";
import { resilientRequest } from "../../shared/utils/ai-service.js";
import promptTemplates from "./promptTemplates.js";
import {
  extractAndParseJson,
  getTitleDescriptionPrompt,
  getSEOKeywordsPrompt,
  getArtworkPrompt,
} from "./podcastHelpers.js";

const {
  getIntroPrompt,
  getMainPrompt,
  getOutroPromptFull,
  humanize,
  enforceTransitions,
  validateScript,
  validateOutro,
} = promptTemplates;

// ─────────────────────────────
// INTRO
// ─────────────────────────────
export async function generateIntro({ date, tone = {} } = {}) {
  try {
    info("script.intro.req", { date });

    const weatherSummary =
      tone.weatherSummary || "grey skies over London with a hint of existential dread";
    const turingQuote =
      tone.turingQuote ||
      "We can only see a short distance ahead, but we can see plenty there that needs to be done.";

    const prompt = getIntroPrompt({ weatherSummary, turingQuote });

    // Your promptTemplates returns a string, not system/user
    const messages = [
      { role: "system", content: "You are a witty Gen-X podcast host creating the intro monologue." },
      { role: "user", content: prompt },
    ];

    const raw = await resilientRequest("intro", { messages });
    let outText = humanize(raw);
    outText = enforceTransitions(outText);

    return outText.trim();
  } catch (err) {
    error("script.intro.fail", { err: err.message });
    throw err;
  }
}

// ─────────────────────────────
// MAIN
// ─────────────────────────────
export async function generateMain({ date, newsItems = [], tone = {} } = {}) {
  try {
    let articles = [];
    if (Array.isArray(newsItems)) articles = newsItems.filter(Boolean);
    else if (typeof newsItems === "string") articles = [newsItems.trim()];
    else if (typeof newsItems === "object" && newsItems !== null)
      articles = [Object.values(newsItems).join(" - ")];

    info("script.main.req", { count: articles.length });

    const prompt = getMainPrompt({ articles, targetDuration: tone.targetDuration || 60 });

    const messages = [
      { role: "system", content: "You are writing a continuous AI podcast monologue with seamless transitions." },
      { role: "user", content: prompt },
    ];

    const raw = await resilientRequest("main", { messages });
    const qa = validateScript(raw);
    if (!qa.isValid) error("script.main.validation", { violations: qa.violations });

    let outText = humanize(raw);
    outText = enforceTransitions(outText);
    return outText.trim();
  } catch (err) {
    error("script.main.fail", { err: err.message });
    throw err;
  }
}

// ─────────────────────────────
// OUTRO
// ─────────────────────────────
export async function generateOutro({
  date,
  episodeTitle,
  siteUrl,
  expectedCta,
  tone = {},
} = {}) {
  try {
    info("script.outro.req", { date });
    const outroPrompt = await getOutroPromptFull();

    const messages = [
      { role: "system", content: "You are writing the outro monologue for the podcast 'Turing’s Torch'." },
      { role: "user", content: outroPrompt },
    ];

    const raw = await resilientRequest("outro", { messages });
    const qa = validateOutro(raw, expectedCta, episodeTitle, siteUrl);
    if (!qa.isValid) error("script.outro.validation", { issues: qa.issues });

    let outText = humanize(raw);
    outText = enforceTransitions(outText);
    return outText.trim();
  } catch (err) {
    error("script.outro.fail", { err: err.message });
    throw err;
  }
}

// ─────────────────────────────
// COMPOSE
// ─────────────────────────────
export async function generateComposedEpisode({
  introText = "",
  mainText = "",
  outroText = "",
} = {}) {
  try {
    info("script.compose.start");

    const composedText = [introText, mainText, outroText].filter(Boolean).join("\n\n");

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
      seoKeywords:
        typeof seoResponse === "string" ? seoResponse.trim() : JSON.stringify(seoResponse),
      artworkPrompt:
        typeof artResponse === "string" ? artResponse.trim() : JSON.stringify(artResponse),
    };

    info("script.compose.done", { title: metadata.title });
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
