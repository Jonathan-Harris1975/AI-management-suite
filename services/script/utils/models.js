// services/script/utils/models.js
// ============================================================
// ✨ Section Generators: Intro / Main / Outro
//    Orchestrator now owns chunking, transcripts & metadata.
// ============================================================

import { resilientRequest } from "../../shared/utils/ai-service.js";
import { getIntroPrompt, getMainPrompt, getOutroPromptFull } from "./promptTemplates.js";
import fetchFeedArticles from "./fetchFeeds.js";
import { cleanTranscript } from "./textHelpers.js";
import { calculateDuration } from "./durationCalculator.js";
import { getWeatherSummary } from "./getWeatherSummary.js";
import getTuringQuote from "./getTuringQuote.js";
import { generateMainLongform } from "./mainChunker.js";
import * as sessionCache from "./sessionCache.js";
import { info, error, debug } from "#logger.js";

/**
 * Strip markdown / cues to get plain spoken text.
 */
function toPlainText(s) {
  if (!s) return "";
  return String(s)
    .replace(/\[(?:music|sfx|cue|intro|outro|.*?)]/gi, "")
    .replace(/\((?:music|sfx|cue|intro|outro|.*?)]?\)/gi, "")
    .replace(/\*{1,3}/g, "")
    .replace(/\s+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function sanitizeOutput(s) {
  return cleanTranscript(toPlainText(s));
}

function normalizeSessionMeta(sessionIdLike) {
  if (typeof sessionIdLike === "string") {
    const m = sessionIdLike.match(/\d{4}-\d{2}-\d{2}/);
    return { sessionId: sessionIdLike, date: m ? m[0] : undefined };
  }
  if (typeof sessionIdLike === "object" && sessionIdLike) {
    return { sessionId: sessionIdLike.sessionId || "", date: sessionIdLike.date };
  }
  return { sessionId: "unknown", date: undefined };
}

/**
 * INTRO
 */
export async function generateIntro(sessionIdLike) {
  const sessionMeta = normalizeSessionMeta(sessionIdLike);
  const weatherSummary = await getWeatherSummary();
  const turingQuote = await getTuringQuote();
  const prompt = getIntroPrompt({ weatherSummary, turingQuote, sessionMeta });

  const res = await resilientRequest("scriptIntro", {
    sessionId: sessionMeta,
    section: "intro",
    messages: [{ role: "system", content: prompt }],
  });

  const cleaned = sanitizeOutput(res);
  await sessionCache.storeTempPart(sessionMeta, "intro", cleaned);
  return cleaned;
}

/**
 * MAIN
 */
export async function generateMain(sessionIdLike) {
  const sessionMeta = normalizeSessionMeta(sessionIdLike);
  const { items, feedUrl } = await fetchFeedArticles();

  const articles = (items || [])
    .map((it) => ({
      title: it?.title?.trim() || "",
      summary:
        it?.summary?.trim() ||
        it?.contentSnippet?.trim() ||
        it?.description?.trim() ||
        "",
      link: it?.link || it?.url || "",
    }))
    .filter((a) => a.title || a.summary);

  const { mainSeconds, targetMins } = calculateDuration(
    "main",
    sessionMeta,
    articles.length
  );

  debug("Main script generation", {
    targetMinutes: targetMins,
    articles: articles.length,
  });

  const combined = await generateMainLongform(sessionMeta, articles, mainSeconds);
  await sessionCache.storeTempPart(sessionMeta, "main", combined);
  return sanitizeOutput(combined);
}

/**
 * OUTRO
 */
export async function generateOutro(sessionIdLike) {
  const sessionMeta = normalizeSessionMeta(sessionIdLike);
  const prompt = await getOutroPromptFull(sessionMeta);

  const res = await resilientRequest("scriptOutro", {
    sessionId: sessionMeta,
    section: "outro",
    messages: [{ role: "system", content: prompt }],
  });

  const cleaned = sanitizeOutput(res);
  await sessionCache.storeTempPart(sessionMeta, "outro", cleaned);
  return cleaned;
}

// Default bundle used by orchestrator
export default {
  generateIntro,
  generateMain,
  generateOutro,
};
