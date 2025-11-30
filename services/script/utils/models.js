// ============================================================================
// services/script/utils/models.js
// Script model layer using prompt templates + tone persona
// ============================================================================

import { resilientRequest } from "../../shared/utils/ai-service.js";
import { extractMainContent } from "./textHelpers.js";
import editAndFormat from "./editAndFormat.js";
import { info, error } from "#logger.js";

import {
  getIntroPrompt,
  getMainPrompt,
  getOutroPromptFull,
} from "./promptTemplates.js";

// Shared log for debugging / meta
const callLog = [];

function resetCallLog() {
  callLog.length = 0;
}

export function getCallLog() {
  return [...callLog];
}

// Core LLM call – uses routeName so ai-config can pick models
async function callLLM(routeName, { sessionId, section, prompt, maxTokens }) {
  try {
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

    const text = extractMainContent(content || "");
    callLog.push(routeName);
    return text;
  } catch (err) {
    error("models.callLLM.fail", { routeName, err: err.message });
    callLog.push(`${routeName}:error`);
    return "";
  }
}

// ---------------------------------------------------------------------------
// INTRO
// ---------------------------------------------------------------------------
export async function generateIntro(ctx = {}) {
  const { sessionId, date, topic, weatherSummary, turingQuote, tone } = ctx;

  const sessionMeta = {
    sessionId,
    date,
    topic,
    tone,
  };

  const prompt = getIntroPrompt({
    weatherSummary,
    turingQuote,
    sessionMeta,
  });

  return callLLM("scriptIntro", {
    sessionId,
    section: "intro",
    prompt,
    maxTokens: 900,
  });
}

// ---------------------------------------------------------------------------
// MAIN (multi-article analysis)
// ---------------------------------------------------------------------------
export async function generateMain(ctx = {}) {
  const { sessionId, date, topic, tone, articles = [] } = ctx;

  const sessionMeta = {
    sessionId,
    date,
    topic,
    tone,
  };

  const prompt = getMainPrompt({
    articles,
    sessionMeta,
  });

  // We still keep the 6-part main routeNames for logging / routing, but
  // promptTemplates handles the full main body in one go.
  const text = await callLLM("scriptMain", {
    sessionId,
    section: "main",
    prompt,
    maxTokens: 2800,
  });

  return text;
}

// ---------------------------------------------------------------------------
// OUTRO
// ---------------------------------------------------------------------------
export async function generateOutro(ctx = {}) {
  const { sessionId, date, topic, tone, sponsorBook } = ctx;

  const sessionMeta = {
    sessionId,
    date,
    topic,
    tone,
  };

  const prompt = getOutroPromptFull(sponsorBook, sessionMeta);

  return callLLM("scriptOutro", {
    sessionId,
    section: "outro",
    prompt,
    maxTokens: 900,
  });
}

// ---------------------------------------------------------------------------
// COMPOSE FULL SCRIPT
// ---------------------------------------------------------------------------
export function composeFullScript(intro, main, outro) {
  const raw = `${intro}\n\n${main}\n\n${outro}`.trim();
  return editAndFormat(raw);
}

// ---------------------------------------------------------------------------
// HIGH-LEVEL ENTRY FOR ORCHESTRATOR
// ---------------------------------------------------------------------------
export async function generateComposedEpisodeParts(ctx = {}) {
  resetCallLog();

  const intro = await generateIntro(ctx);
  const main = await generateMain(ctx);
  const outro = await generateOutro(ctx);

  const formatted = composeFullScript(intro, main, outro);
  const snapshot = getCallLog();

  info("script.models.complete", {
    sessionId: ctx.sessionId,
    calls: snapshot,
  });

  return {
    intro,
    main,
    outro,
    formatted,
    callLog: snapshot,
  };
}

export default {
  generateIntro,
  generateMain,
  generateOutro,
  composeFullScript,
  generateComposedEpisodeParts,
  getCallLog,
};
