// services/script/utils/models.js
import { info, error } from "#logger.js";
import { resilientRequest } from "../../shared/utils/ai-service.js";
import promptTemplates from "./promptTemplates.js";

import { getWeatherSummary } from "./getWeatherSummary.js";
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

/* ────────────────────────────────────────────────
 * INTRO — uses live Weather API + Turing quote
 * ──────────────────────────────────────────────── */
export async function generateIntro({ date, tone = {} } = {}) {
  try {
    info("script.intro.req", { date });

    // ✅ Live weather summary (fallback to default if offline)
    const weatherSummary =
      (await getWeatherSummary()) ||
      tone.weatherSummary ||
      "miserable grey drizzle over London";

    // ✅ Random Alan Turing quote (cached from data file)
    const turingQuote =
      (await getTuringQuote()) ||
      tone.turingQuote ||
      "We can only see a short distance ahead, but we can see plenty there that needs to be done.";

    const prompt = getIntroPrompt({ weatherSummary, turingQuote });

    // ✅ Corrected call — route name string
    const raw = await resilientRequest("intro", prompt);

    let outText = humanize(raw);
    outText = enforceTransitions(outText);
    return outText.trim();
  } catch (err) {
    error("script.intro.fail", { err: err.message });
    throw err;
  }
}

/* ────────────────────────────────────────────────
 * MAIN — handles RSS or Make.com article arrays
 * ──────────────────────────────────────────────── */
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

    const raw = await resilientRequest("main", prompt);

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

/* ────────────────────────────────────────────────
 * OUTRO — pulls sponsor + CTA dynamically
 * ──────────────────────────────────────────────── */
export async function generateOutro({ date } = {}) {
  try {
    info("script.outro.req", { date });

    const sponsor = await getSponsor();
    const cta = await generateCta(sponsor);

    const outroPrompt = await getOutroPromptFull(sponsor, cta);

    const raw = await resilientRequest("outro", outroPrompt);

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

/* ────────────────────────────────────────────────
 * COMPOSE — merges intro + main + outro and
 * generates metadata via "metadata" route
 * ──────────────────────────────────────────────── */
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

    // 🧠 Title + Description
    const tdPrompt = getTitleDescriptionPrompt(composedText);
    const tdRaw = await resilientRequest("metadata", tdPrompt);
    const parsedMeta = extractAndParseJson(tdRaw) || {};

    // 🧠 SEO Keywords
    const seoPrompt = getSEOKeywordsPrompt(
      parsedMeta.description || composedText
    );
    const seoRaw = await resilientRequest("metadata", seoPrompt);

    // 🧠 Artwork
    const artPrompt = getArtworkPrompt(
      parsedMeta.description || composedText
    );
    const artRaw = await resilientRequest("metadata", artPrompt);

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
