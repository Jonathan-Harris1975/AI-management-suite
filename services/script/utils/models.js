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

/**
 * Build chat-style messages from {system,userText}
 */
function asChat(systemText, userText) {
  return [
    { role: "system", content: systemText || "" },
    { role: "user", content: userText || "" },
  ];
}

// INTRO
export async function generateIntro({ date, tone = {} } = {}) {
  try {
    // getIntroPrompt RETURNS JUST THE USER PROMPT STRING in your current impl,
    // so we treat persona etc. as system, and the body as user.
    const userText = getIntroPrompt({ date, vibe: tone.vibe });
    const systemText = "You are generating the opening monologue for the AI news podcast.";
    const messages = asChat(systemText, userText);

    const raw = await resilientRequest("intro", { messages });

    // raw should be a string script
    let cleaned = humanize(raw);
    cleaned = enforceTransitions(cleaned);
    return cleaned.trim();
  } catch (err) {
    error("script.intro.fail", { err: err.message });
    throw err;
  }
}

// MAIN
export async function generateMain({ date, newsItems = [], tone = {} } = {}) {
  try {
    // normalize incoming newsItems into array of article strings
    let articles = [];
    if (Array.isArray(newsItems)) {
      articles = newsItems
        .map(v => {
          if (typeof v === "string") return v;
          if (v && typeof v === "object") {
            // flatten {title, summary} etc.
            return Object.values(v).join(" - ");
          }
          return "";
        })
        .filter(Boolean);
    } else if (newsItems && typeof newsItems === "object") {
      articles = [Object.values(newsItems).join(" - ")];
    } else if (typeof newsItems === "string" && newsItems.trim()) {
      articles = [newsItems.trim()];
    }

    info("script.main.input", { count: articles.length });

    // getMainPrompt returns a SINGLE STRING prompt (user text)
    const userText = getMainPrompt({
      date,
      articles,
      vibe: tone.vibe,
      targetDuration: 60,
    });
    const systemText =
      "You are generating the main body of the AI news podcast. Produce one seamless spoken monologue, no headings, no stage directions.";
    const messages = asChat(systemText, userText);

    const raw = await resilientRequest("main", { messages });

    // validateScript() in your promptTemplates currently RETURNS an object
    // { isValid, violations, ... } – NOT the cleaned script.
    // Using it directly as a string caused the crash you saw.
    // We just want to log validation, not replace the text.
    const validation = validateScript(raw);
    if (!validation.isValid) {
      error("script.main.validation", { violations: validation.violations });
    }

    let cleaned = humanize(raw);
    cleaned = enforceTransitions(cleaned);
    return cleaned.trim();
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
    // getOutroPromptFull() is async and returns the FULL outro user prompt text
    const userText = await getOutroPromptFull({
      date,
      vibe: tone.vibe,
      siteUrl,
    });

    const systemText =
      "You are generating the closing monologue for the AI news podcast. You MUST include CTA, book mention, URL, and keep flow natural.";
    const messages = asChat(systemText, userText);

    const raw = await resilientRequest("outro", { messages });

    // validateOutro returns an object with booleans, not the cleaned text
    const outroCheck = validateOutro(
      raw,
      expectedCta,
      episodeTitle,
      siteUrl
    );
    if (!outroCheck.isValid) {
      error("script.outro.validation", { issues: outroCheck.issues });
    }

    let cleaned = humanize(raw);
    cleaned = enforceTransitions(cleaned);
    return cleaned.trim();
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
  tone = {},
} = {}) {
  try {
    info("script.compose.start");

    // 1. Ask "compose" route to blend them into a single final readthrough script
    const systemText =
      "You are an editor. Merge the provided intro, main body, and outro into one smooth, final podcast script in a single narrator voice. Remove duplicates. Keep pacing tight. Do not add headings.";
    const userText =
      `INTRO:\n${introText}\n\nMAIN:\n${mainText}\n\nOUTRO:\n${outroText}\n\nNow return one clean final script.`;

    const composeMessages = asChat(systemText, userText);
    const composedTextRaw = await resilientRequest("compose", {
      messages: composeMessages,
    });

    const composedText = composedTextRaw.trim();

    // 2. Generate metadata using "metadata" route (prompt mode)
    const titlePrompt = getTitleDescriptionPrompt(composedText);
    const titleResponse = await resilientRequest("metadata", {
      prompt: titlePrompt,
    });
    const parsedMeta = extractAndParseJson(titleResponse);

    const seoPrompt = getSEOKeywordsPrompt(
      parsedMeta?.description || composedText
    );
    const seoResponse = await resilientRequest("metadata", {
      prompt: seoPrompt,
    });

    const artworkPrompt = getArtworkPrompt(
      parsedMeta?.description || composedText
    );
    const artResponse = await resilientRequest("metadata", {
      prompt: artworkPrompt,
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
