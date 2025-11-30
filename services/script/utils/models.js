// ============================================================================
// services/script/utils/models.js
// ----------------------------------------------------------------------------
// High-level LLM calls for intro / main / outro / composed scripts.
// Uses ai-service resilientRequest + promptTemplates + toneSetter.
// ============================================================================

import { resilientRequest } from "../../shared/utils/ai-service.js";
import { extractMainContent } from "./textHelpers.js";
import {
  buildIntroPrompt,
  buildMainPrompt,
  buildOutroPrompt,
} from "./promptTemplates.js";
import { buildPersona } from "./toneSetter.js";
import fetchFeeds from "./fetchFeeds.js";
import { info } from "#logger.js";

function normaliseContext(input = {}) {
  if (typeof input === "string") {
    return { sessionId: input };
  }
  const now = new Date();
  return {
    sessionId:
      input.sessionId ||
      `TT-${now.toISOString().slice(0, 10)}`,
    date: input.date || now.toISOString().slice(0, 10),
    topic: input.topic || null,
    tone: input.tone || {},
    weatherSummary: input.weatherSummary || "",
    turingQuote: input.turingQuote || "",
  };
}

async function callRoute(routeName, { sessionId, systemContent, userContent, maxTokens = 1500 }) {
  const messages = [
    { role: "system", content: systemContent },
  ];
  if (userContent) {
    messages.push({ role: "user", content: userContent });
  }

  const res = await resilientRequest({
    routeName,
    sessionId,
    messages,
    max_tokens: maxTokens,
  });

  return extractMainContent(res?.content || res || "");
}

// ---------------------------------------------------------------------------
// INTRO
// ---------------------------------------------------------------------------
export async function generateIntro(rawCtx = {}) {
  const ctx = normaliseContext(rawCtx);
  const systemContent = buildIntroPrompt({
    sessionId: ctx.sessionId,
    date: ctx.date,
    weatherSummary: ctx.weatherSummary,
    turingQuote: ctx.turingQuote,
  });

  return callRoute("scriptIntro", {
    sessionId: ctx.sessionId,
    systemContent,
    userContent: "",
    maxTokens: 1000,
  });
}

// ---------------------------------------------------------------------------
// MAIN
// ---------------------------------------------------------------------------
async function generateMainPart(rawCtx, index) {
  const ctx = normaliseContext(rawCtx);
  const persona = buildPersona(ctx.sessionId);

  // pull feed items once per episode (cached in fetchFeeds internally)
  const articles = await fetchFeeds();

  const systemContent = buildMainPrompt({
    sessionId: ctx.sessionId,
    articles,
  });

  const userContent = `
You are now writing main segment #${index}.
Keep tone and pacing consistent with the rest of the episode.
`.trim();

  return callRoute(`scriptMain-${index}`, {
    sessionId: ctx.sessionId,
    systemContent: `${persona}\n\n${systemContent}`,
    userContent,
    maxTokens: 1400,
  });
}

export async function generateMain(rawCtx = {}) {
  const parts = [];
  for (let i = 1; i <= 6; i += 1) {
    const part = await generateMainPart(rawCtx, i);
    if (part) parts.push(part);
  }
  return parts.join("\n\n");
}

// ---------------------------------------------------------------------------
// OUTRO
// ---------------------------------------------------------------------------
export async function generateOutro(rawCtx = {}) {
  const ctx = normaliseContext(rawCtx);
  const systemContent = await buildOutroPrompt({
    sessionId: ctx.sessionId,
  });

  return callRoute("scriptOutro", {
    sessionId: ctx.sessionId,
    systemContent,
    userContent: "",
    maxTokens: 900,
  });
}

// ---------------------------------------------------------------------------
// COMPOSED EPISODE
// ---------------------------------------------------------------------------
export async function generateComposedEpisodeParts(rawCtx = {}) {
  const ctx = normaliseContext(rawCtx);

  info("script.models.compose.start", {
    sessionId: ctx.sessionId,
    date: ctx.date,
  });

  const intro = await generateIntro(ctx);
  const main = await generateMain(ctx);
  const outro = await generateOutro(ctx);

  const formatted = [intro, main, outro].filter(Boolean).join("\n\n");

  info("script.models.compose.complete", {
    sessionId: ctx.sessionId,
    totalLength: formatted.length,
  });

  return {
    intro,
    main,
    outro,
    formatted,
    callLog: [], // ai-service already logs per-route usage
  };
}

export default {
  generateIntro,
  generateMain,
  generateOutro,
  generateComposedEpisodeParts,
};
