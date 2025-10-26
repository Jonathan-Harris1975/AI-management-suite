// services/script/utils/models.js
import { info, error } from "#logger.js";
import { callLLMText } from "../../shared/utils/ai-service.js";
import promptTemplates from "./promptTemplates.js";

import { getWeatherSummary } from "./weather.js";
import { getTuringQuote } from "./getTuringQuote.js";
import getSponsor from "./getSponsor.js";
import generateCta from "./generateCta.js";

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

// INTRO — now uses live weather + Turing quote
export async function generateIntro({ date, tone = {} } = {}) {
  try {
    info("script.intro.req", { date });

    // ✅ Get live data from utils
    const weatherSummary =
      (await getWeatherSummary()) ||
      tone.weatherSummary ||
      "typical British drizzle over London";

    const turingQuote =
      (await getTuringQuote()) ||
      tone.turingQuote ||
      "We can only see a short distance ahead, but we can see plenty there that needs to be done.";

    const prompt = getIntroPrompt({ weatherSummary, turingQuote });

    const raw = await callLLMText({ routeName: "intro", prompt });

    let outText = humanize(raw);
    outText = enforceTransitions(outText);
    return outText.trim();
  } catch (err) {
    error("script.intro.fail", { err: err.message });
    throw err;
  }
}

// MAIN — unchanged
export async function generateMain({ date, newsItems = [], tone = {} } = {}) {
  try {
    let articles = [];
    if (Array.isArray(newsItems)) {
      articles = newsItems
        .filter((v) => !!v)
        .map((v) => (typeof v === "string" ? v : JSON.stringify(v)));
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

    const raw = await callLLMText({ routeName: "main", prompt });

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

// OUTRO — now pulls sponsor + CTA automatically
export async function generateOutro({ date } = {}) {
  try {
    info("script.outro.req", { date });

    // ✅ Load sponsor and CTA dynamically
    const sponsor = await getSponsor();
    const cta = await generateCta(sponsor);

    const outroPrompt = await getOutroPromptFull(sponsor, cta);

    const raw = await callLLMText({ routeName: "outro", prompt: outroPrompt });

    const qa = validateOutro(raw, cta, sponsor.title, sponsor.url);
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

// COMPOSE — unchanged
export async function generateComposedEpisode({
  introText = "",
  mainText = "",
  outroText = "",
} = {}) {
  try {
    info("script.compose.start");

    const composedText = [introText, mainText, outroText]
      .map((s) => s.trim())
      .filter(Boolean)
      .join("\n\n")
      .trim();

    const tdPrompt = getTitleDescriptionPrompt(composedText);
    const tdRaw = await callLLMText({ routeName: "metadata", prompt: tdPrompt });
    const parsedMeta = extractAndParseJson(tdRaw) || {};

    const seoPrompt = getSEOKeywordsPrompt(
      parsedMeta.description || composedText
    );
    const seoRaw = await callLLMText({ routeName: "metadata", prompt: seoPrompt });

    const artPrompt = getArtworkPrompt(
      parsedMeta.description || composedText
    );
    const artRaw = await callLLMText({ routeName: "metadata", prompt: artPrompt });

    const metadata = {
      title: parsedMeta.title || "Untitled Episode",
      description: parsedMeta.description || "No description generated.",
      seoKeywords:
        typeof seoRaw === "string" ? seoRaw.trim() : JSON.stringify(seoRaw),
      artworkPrompt:
        typeof artRaw === "string" ? artRaw.trim() : JSON.stringify(artRaw),
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
