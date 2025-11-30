// ============================================================================
// services/script/utils/models.js
// Unified script model layer for Turing's Torch
// ----------------------------------------------------------------------------
// - Uses resilientRequest(routeName, { ...opts }) signature
// - Prompts are provided by promptTemplates + toneSetter
// - Intro / main / outro generation with weather + Turing quote + RSS articles
// - Keeps things TTS-friendly (no markdown, no cues, no emojis)
// ============================================================================

import { resilientRequest } from "../../shared/utils/ai-service.js";
import { getIntroPrompt, getMainPrompt, getOutroPromptFull } from "./promptTemplates.js";
import fetchFeedArticles from "./fetchFeeds.js";
import { cleanTranscript } from "./textHelpers.js";
import { calculateDuration } from "./durationCalculator.js";
import getWeatherSummary from "./getWeatherSummary.js";
import getTuringQuote from "./getTuringQuote.js";
import { generateMainLongform } from "./mainChunker.js";
import * as sessionCache from "./sessionCache.js";
import { info, debug } from "#logger.js";

// ---------------------------------------------------------------------------
// Helper: strip scene cues / markdown so the LLM output is TTS-friendly
// ---------------------------------------------------------------------------
function toPlainText(s) {
  if (!s) return "";
  return String(s)
    // Strip obvious scene directions / music cues
    .replace(/\[(?:music|sfx|sound|cue|intro|outro|transition|.*?)]/gi, "")
    .replace(/\((?:music|sfx|sound|cue|intro|outro|transition|.*?)]?\)/gi, "")

    // Strip markdown formatting
    .replace(/\*{1,3}/g, "")
    .replace(/^#{1,6}\s*/gm, "")

    // Neaten whitespace
    .replace(/\s+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function sanitizeOutput(s) {
  return cleanTranscript(toPlainText(s));
}

// ---------------------------------------------------------------------------
// Session metadata normalisation
// ---------------------------------------------------------------------------
function normalizeSessionMeta(ctx = {}) {
  // Accept either a plain sessionId string or a small context object
  if (typeof ctx === "string") {
    const m = ctx.match(/\d{4}-\d{2}-\d{2}/);
    return { sessionId: ctx, date: m ? m[0] : undefined };
  }

  if (typeof ctx === "object" && ctx) {
    return {
      sessionId: ctx.sessionId || "",
      date: ctx.date,
      topic: ctx.topic,
      tone: ctx.tone,
    };
  }

  return { sessionId: "unknown", date: undefined };
}

// ---------------------------------------------------------------------------
// Core LLM caller (old ai-service signature)
// ---------------------------------------------------------------------------
async function callLLM(routeName, { sessionId, section, prompt, maxTokens }) {
  const content = await resilientRequest(routeName, {
    sessionId,
    section,
    messages: [
      {
        role: "system",
        content: prompt,
      },
    ],
    max_tokens: maxTokens,
  });

  return sanitizeOutput(content || "");
}

// ============================================================================
// 1) INTRO – uses promptTemplates + weather + Turing quote
// ============================================================================
export async function generateIntro(ctx = {}) {
  const sessionMeta = normalizeSessionMeta(ctx);

  const weatherSummary = await getWeatherSummary();
  const turingQuote = await getTuringQuote();

  const prompt = getIntroPrompt({
    weatherSummary,
    turingQuote,
    sessionMeta,
  });

  const text = await callLLM("scriptIntro", {
    sessionId: sessionMeta,
    section: "intro",
    prompt,
    maxTokens: 900,
  });

  await sessionCache.storeTempPart(sessionMeta, "intro", text);

  info("script.intro.generated", {
    sessionId: sessionMeta.sessionId,
    date: sessionMeta.date,
  });

  return text;
}

// ============================================================================
// 2) MAIN – longform, driven by RSS feed articles
// ============================================================================
export async function generateMain(ctx = {}) {
  const sessionMeta = normalizeSessionMeta(ctx);

  const { items } = await fetchFeedArticles();

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

  debug("script.main.generate", {
    sessionId: sessionMeta.sessionId,
    targetMinutes: targetMins,
    articleCount: articles.length,
  });

  // Build a single "big" prompt for the whole main section
  const prompt = getMainPrompt({
    articles,
    sessionMeta,
  });

  // generateMainLongform wraps the LLM calls into multiple “scriptMain-*” routes
  const combined = await generateMainLongform(
    { ...sessionMeta, mainSeconds },
    articles,
    mainSeconds
  );

  const cleaned = sanitizeOutput(combined);
  await sessionCache.storeTempPart(sessionMeta, "main", cleaned);

  return cleaned;
}

// ============================================================================
// 3) OUTRO – full outro with sponsor + CTA via promptTemplates
// ============================================================================
export async function generateOutro(ctx = {}) {
  const sessionMeta = normalizeSessionMeta(ctx);

  const prompt = await getOutroPromptFull(sessionMeta);

  const text = await callLLM("scriptOutro", {
    sessionId: sessionMeta,
    section: "outro",
    prompt,
    maxTokens: 900,
  });

  await sessionCache.storeTempPart(sessionMeta, "outro", text);

  info("script.outro.generated", {
    sessionId: sessionMeta.sessionId,
    date: sessionMeta.date,
  });

  return text;
}

// ============================================================================
// 4) Optional local “compose” helper (used by some debug routes)
// ============================================================================
export function composeFullScript(intro, main, outro) {
  return `${intro}\n\n${main}\n\n${outro}`.trim();
}

export default {
  generateIntro,
  generateMain,
  generateOutro,
  composeFullScript,
};
