// services/script/utils/models.js
import { info, error } from "#logger.js";
import { callLLMText } from "../../shared/utils/ai-service.js";
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

// INTRO
export async function generateIntro({ date, tone = {} } = {}) {
  try {
    info("script.intro.req", { date });

    const prompt = getIntroPrompt({
      weatherSummary: tone.weatherSummary || "miserable grey drizzle over London",
      turingQuote:
        tone.turingQuote ||
        "We can only see a short distance ahead, but we can see plenty there that needs to be done.",
    });

    const raw = await callLLMText({ route: "intro", prompt });

    let outText = humanize(raw);
    outText = enforceTransitions(outText);
    return outText.trim();
  } catch (err) {
    error("script.intro.fail", { err: err.message });
    throw err;
  }
}

// MAIN
export async function generateMain({ date, newsItems = [], tone = {} } = {}) {
  try {
    // normalise incoming newsItems (Make.com sometimes sends object or string)
    let articles = [];
    if (Array.isArray(newsItems)) {
      articles = newsItems
        .filter(v => !!v)
        .map(v => (typeof v === "string" ? v : JSON.stringify(v)));
    } else if (typeof newsItems === "object" && newsItems !== null) {
      const flat = Object.values(newsItems).join(" — ");
      articles = [flat];
    } else if (typeof newsItems === "string" && newsItems.trim()) {
      articles = [newsItems.trim()];
    }

    info("script.main.req", { count: articles.length });

    const prompt = getMainPrompt({
      articles,
      targetDuration: tone.targetDuration || 60,
    });

    const raw = await callLLMText({ route: "main", prompt });

    // QA check only (don't replace text with object)
    const qa = validateScript(raw);
    if (!qa.isValid) {
      error("script.main.validation", { violations: qa.violations });
    }

    let outText = humanize(raw);
    outText = enforceTransitions(outText);
    return outText.trim();
  } catch (err) {
    error("script.main.fail", { err: err.message });
    throw err;
  }
}

// OUTRO
export async function generateOutro({
  date,
  episodeTitle,
  siteUrl,
  expectedCta,
  tone = {},
} = {}) {
  try {
    info("script.outro.req", { date });

    const outroPrompt = await getOutroPromptFull(); // async

    const raw = await callLLMText({ route: "outro", prompt: outroPrompt });

    // QA check only
    const qa = validateOutro(
      raw,
      expectedCta || "",
      episodeTitle || "",
      siteUrl || ""
    );
    if (!qa.isValid) {
      error("script.outro.validation", { issues: qa.issues });
    }

    let outText = humanize(raw);
    outText = enforceTransitions(outText);
    return outText.trim();
  } catch (err) {
    error("script.outro.fail", { err: err.message });
    throw err;
  }
}

// COMPOSE
export async function generateComposedEpisode({
  introText = "",
  mainText = "",
  outroText = "",
} = {}) {
  try {
    info("script.compose.start");

    // 1. Stitch final script as one block
    // The reference code treats compose as assembly, not "LLM rewrite the whole thing again".
    // We'll keep it that way: intro + main + outro.
    const composedText = [introText, mainText, outroText]
      .map(s => s.trim())
      .filter(Boolean)
      .join("\n\n")
      .trim();

    // 2. Generate metadata (title / desc / seo / artwork)
    //    We call the "metadata" route in ai-config for these helper prompts.
    const tdPrompt = getTitleDescriptionPrompt(composedText);
    const tdRaw = await callLLMText({ route: "metadata", prompt: tdPrompt });
    const parsedMeta = extractAndParseJson(tdRaw) || {};

    const seoPrompt = getSEOKeywordsPrompt(
      parsedMeta.description || composedText
    );
    const seoRaw = await callLLMText({ route: "metadata", prompt: seoPrompt });

    const artPrompt = getArtworkPrompt(
      parsedMeta.description || composedText
    );
    const artRaw = await callLLMText({ route: "metadata", prompt: artPrompt });

    const metadata = {
      title: parsedMeta.title || "Untitled Episode",
      description: parsedMeta.description || "No description generated.",
      seoKeywords:
        typeof seoRaw === "string" ? seoRaw.trim() : JSON.stringify(seoRaw),
      artworkPrompt:
        typeof artRaw === "string" ? artRaw.trim() : JSON.stringify(artRaw),
    };

    info("script.compose.done", { title: metadata.title });

    return {
      composedText,
      metadata,
    };
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
