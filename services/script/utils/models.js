// services/script/utils/models.js
// Centralised model runners for intro / main / outro / composed
// Uses shared ai-service.js for model routing + OpenRouter configuration

import { info, error } from "#logger.js";
import { callLLMText } from "../../shared/utils/ai-service.js";
import promptTemplates from "./promptTemplates.js";
import {
  extractAndParseJson,
  getTitleDescriptionPrompt,
  getSEOKeywordsPrompt,
  getArtworkPrompt,
} from "./podcastHelpers.js";
import { getFeedArticles } from "./rssFetcher.js"; // ✅ new helper for FEED_URL support

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

// ─────────────────────────────
// MAIN — FEED_URL + fallback
// ─────────────────────────────
export async function generateMain({ date, newsItems = [], tone = {} } = {}) {
  try {
    let articles = [];

    // Normalize input from payload
    if (Array.isArray(newsItems) && newsItems.length > 0) {
      articles = newsItems
        .filter(v => !!v)
        .map(v => (typeof v === "string" ? v : JSON.stringify(v)));
    } else if (typeof newsItems === "object" && newsItems !== null) {
      const flat = Object.values(newsItems).join(" — ");
      articles = [flat];
    } else if (typeof newsItems === "string" && newsItems.trim()) {
      articles = [newsItems.trim()];
    }

    // If no articles provided, auto-fetch from FEED_URL
    if (articles.length === 0) {
      const feedUrl = process.env.FEED_URL;
      if (!feedUrl) throw new Error("FEED_URL not set in environment");
      const fetched = await getFeedArticles(feedUrl);
      if (!Array.isArray(fetched) || fetched.length === 0)
        throw new Error(`No recent feed articles found at ${feedUrl}`);
      articles = fetched;
      info("script.main.feedLoad", { feedUrl, count: articles.length });
    }

    info("script.main.req", { count: articles.length });

    const prompt = getMainPrompt({
      articles,
      targetDuration: tone.targetDuration || 60,
    });

    const raw = await callLLMText({ route: "main", prompt });

    // Validation check
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

    const outroPrompt = await getOutroPromptFull(); // async
    const raw = await callLLMText({ route: "outro", prompt: outroPrompt });

    // Validation
    const qa = validateOutro(
      raw,
      expectedCta || "",
      episodeTitle || "",
      siteUrl || ""
    );
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

    const composedText = [introText, mainText, outroText]
      .map(s => s.trim())
      .filter(Boolean)
      .join("\n\n")
      .trim();

    // Title + Description
    const tdPrompt = getTitleDescriptionPrompt(composedText);
    const tdRaw = await callLLMText({ route: "metadata", prompt: tdPrompt });
    const parsedMeta = extractAndParseJson(tdRaw) || {};

    // SEO
    const seoPrompt = getSEOKeywordsPrompt(parsedMeta.description || composedText);
    const seoRaw = await callLLMText({ route: "metadata", prompt: seoPrompt });

    // Artwork
    const artPrompt = getArtworkPrompt(parsedMeta.description || composedText);
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

// ─────────────────────────────
// EXPORTS
// ─────────────────────────────
export default {
  generateIntro,
  generateMain,
  generateOutro,
  generateComposedEpisode,
};
