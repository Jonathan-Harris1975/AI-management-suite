// ============================================================================
// models.js – FULLY FIXED VERSION (final)
// ============================================================================
// - Uses resilientRequest correctly
// - Weather + Turing quote passed through
// - Proper SYSTEM + USER message structure (critical!)
// - Ensures the LLM always returns full, non-empty text
// - Returns clean, TTS-friendly output
// ============================================================================

import { resilientRequest } from "../../shared/utils/ai-service.js";
import { extractMainContent } from "./textHelpers.js";
import editAndFormat from "./editAndFormat.js";
import { info } from "#logger.js";

// ---------------------------------------------------------------------------
// Safe routeName helper
// ---------------------------------------------------------------------------
function safeRouteName(name) {
  if (!name) return "unknown";
  return typeof name === "string" ? name : JSON.stringify(name);
}

// ---------------------------------------------------------------------------
// Shared log
// ---------------------------------------------------------------------------
const callLog = [];
export function getCallLog() {
  return callLog;
}

// ---------------------------------------------------------------------------
// Wrapper around resilientRequest
// ---------------------------------------------------------------------------
async function safeLLM({ routeName, model, messages, max_tokens }) {
  const safeName = safeRouteName(routeName);

  const res = await resilientRequest({
    routeName: safeName,
    model,
    messages,
    max_tokens,
  });

  callLog.push({
    routeName: safeName,
    provider: res?.provider || "unknown",
  });

  return extractMainContent(res?.content || "");
}

// ============================================================================
// INTRO
// ============================================================================
export async function generateIntro({ date, topic, tone, weather, turing }) {
  const systemPrompt = `
You are writing the INTRO for a British AI news podcast.
Use a calm, polished, conversational tone.
Avoid hype, markdown, emojis, and scene directions.
`.trim();

  const userPrompt = `
Today's date: ${date}
Topic: ${topic || "recent advancements in artificial intelligence"}

Weather summary for the intro:
${weather || "(no weather available)"}

Alan Turing quote for opening context:
${turing || "(no quote available)"}

Tone guidance: ${JSON.stringify(tone || {})}

Write 2 short paragraphs, clean and natural.
`.trim();

  return safeLLM({
    routeName: "scriptIntro",
    model: "chatgpt",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    max_tokens: 1000,
  });
}

// ============================================================================
// MAIN (chunked)
// ============================================================================
async function generateMainChunk({ date, topic, tone, index }) {
  const systemPrompt = `
You are producing a MAIN segment for a British artificial intelligence news podcast.
Keep concise, conversational, non-technical unless needed.
`.trim();

  const userPrompt = `
This is part ${index} of the main section.

Topic: ${topic}
Date: ${date}
Tone: ${JSON.stringify(tone || {})}

Discuss one angle or insight related to the topic.
Write 1–2 paragraphs, no markdown, no cues.
`.trim();

  return safeLLM({
    routeName: `scriptMain-${index}`,
    model: "google",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    max_tokens: 1300,
  });
}

export async function generateMain(args) {
  const parts = [];
  for (let i = 1; i <= 6; i++) {
    parts.push(await generateMainChunk({ ...args, index: i }));
  }
  return parts.join("\n\n");
}

// ============================================================================
// OUTRO
// ============================================================================
export async function generateOutro({ date, topic, tone }) {
  const systemPrompt = `
Write a British outro for an AI news podcast.
Keep it sharp, warm, and human.
No CTA. No markdown. No scene cues.
`.trim();

  const userPrompt = `
Topic reference: ${topic}
Date: ${date}
Tone: ${JSON.stringify(tone || {})}

Write 1 short paragraph.
`.trim();

  return safeLLM({
    routeName: "scriptOutro",
    model: "google",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    max_tokens: 600,
  });
}

// ============================================================================
// COMPOSE + FORMAT
// ============================================================================
export function composeFullScript(intro, main, outro) {
  return editAndFormat(`${intro}\n\n${main}\n\n${outro}`.trim());
}

// ============================================================================
// Main exported entry for orchestrator
// ============================================================================
export async function generateComposedEpisodeParts(args) {
  const intro = await generateIntro(args);
  const main = await generateMain(args);
  const outro = await generateOutro(args);

  const formatted = composeFullScript(intro, main, outro);

  return {
    intro,
    main,
    outro,
    formatted,
    callLog,
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
