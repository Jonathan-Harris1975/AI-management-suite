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
// Shared LLM runner
// ─────────────────────────────
async function runLLM(routeName, promptPack = {}) {
  const { system = "", user = "" } = promptPack;
  const messages = [
    { role: "system", content: system },
    { role: "user", content: user },
  ];

  info("script.llm.call", { routeName });

  const raw = await resilientRequest(routeName, { messages });
  if (!raw || typeof raw !== "string")
    throw new Error(`Empty LLM response for ${routeName}`);
  return raw.trim();
}

// ─────────────────────────────
// INTRO
// ─────────────────────────────
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

// ─────────────────────────────
// MAIN (robust normalization)
// ─────────────────────────────
export async function generateMain({ date, newsItems = [], tone = {} } = {}) {
  try {
    let articles = [];

    if (Array.isArray(newsItems)) {
      articles = newsItems.filter(Boolean);
    } else if (typeof newsItems === "object" && newsItems !== null) {
      // Flatten structured object into text
      const str = Object.values(newsItems).join(" - ");
      articles = [str];
    } else if (typeof newsItems === "string" && newsItems.trim()) {
      articles = [newsItems.trim()];
    }

    info("script.main.input", { count: articles.length });

    const { system, user } = getMainPrompt({ date, articles, vibe: tone.vibe });
    const raw = await runLLM("main", { system, user });

    const validation = validateScript(raw);
    let cleaned = raw;

    if (validation && validation.isValid === false) {
      info("script.main.validation", { issues: validation.violations.length });
    }

    cleaned = humanize(cleaned);
    cleaned = enforceTransitions(cleaned);
    return cleaned.trim();
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
    const { system, user } = await getOutroPromptFull({
      date,
      vibe: tone.vibe,
      siteUrl,
    });

    const raw = await runLLM("outro", { system, user });
    const validation = validateOutro(raw, expectedCta, episodeTitle, siteUrl);

    let cleaned = raw;
    if (validation && validation.isValid === false) {
      info("script.outro.validation", { issues: validation.issues.length });
    }

    cleaned = humanize(cleaned);
    cleaned = enforceTransitions(cleaned);
    return cleaned.trim();
  } catch (err) {
    error("script.outro.fail", { err: err.message });
    throw err;
  }
}

// ─────────────────────────────
// COMPOSE (includes metadata)
// ─────────────────────────────
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
    const titleResponse = await resilientRequest("compose", {
      messages: [
        {
          role: "system",
          content:
            "You are a helpful assistant that creates podcast metadata (title + description).",
        },
        { role: "user", content: titlePrompt },
      ],
    });
    const parsedMeta = extractAndParseJson(titleResponse);

    const seoPrompt = getSEOKeywordsPrompt(
      parsedMeta?.description || composedText
    );
    const seoResponse = await resilientRequest("compose", {
      messages: [
        {
          role: "system",
          content:
            "You are an SEO expert assisting in keyword generation for podcast episodes.",
        },
        { role: "user", content: seoPrompt },
      ],
    });

    const artworkPrompt = getArtworkPrompt(
      parsedMeta?.description || composedText
    );
    const artResponse = await resilientRequest("compose", {
      messages: [
        {
          role: "system",
          content:
            "You are an AI prompt engineer. Generate a concise, vivid visual prompt for an episode cover image.",
        },
        { role: "user", content: artworkPrompt },
      ],
    });

    const metadata = {
      title: parsedMeta?.title || "Untitled Episode",
      description:
        parsedMeta?.description || "No description generated.",
      seoKeywords:
        typeof seoResponse === "string"
          ? seoResponse.trim()
          : JSON.stringify(seoResponse),
      artworkPrompt:
        typeof artResponse === "string"
          ? artResponse.trim()
          : JSON.stringify(artResponse),
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
