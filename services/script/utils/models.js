// services/script/utils/models.js
// ============================================================================
// Minimal script models – intro / main / outro
// Uses resilientRequest + ai-config routing by routeName
// ============================================================================

import { resilientRequest } from "../../shared/utils/ai-service.js";
import { extractMainContent } from "./textHelpers.js";
import editAndFormat from "./editAndFormat.js";
import { info } from "#logger.js";

const callLog = [];

// ---------------------------------------------------------------------------
// Low-level helper – use routeName only, let ai-config pick the model
// ---------------------------------------------------------------------------
async function llmCall(routeName, messages, max_tokens = 1600) {
  const safeRouteName = typeof routeName === "string" ? routeName : "unknown";

  const res = await resilientRequest({
    routeName: safeRouteName,
    messages,
    max_tokens,
  });

  callLog.push({
    routeName: safeRouteName,
    provider: res?.provider || "unknown",
  });

  return extractMainContent(res?.content || res || "");
}

// ============================================================================
// INTRO
// ============================================================================
export async function generateIntro({ date, topic, tone } = {}) {
  const systemPrompt = `
You are writing the INTRO for a British artificial intelligence news podcast.
Use a calm, polished, conversational tone.
Avoid hype, markdown, emojis, and scene directions.
`.trim();

  const userPrompt = `
Today's date: ${date || new Date().toISOString()}
Topic: ${topic || "recent developments in artificial intelligence"}
Tone: ${JSON.stringify(tone || { style: "balanced" })}

Write 2 short paragraphs that set the scene and hook the listener.
Do not include any headings or speaker labels.
`.trim();

  return llmCall("scriptIntro", [
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt },
  ]);
}

// ============================================================================
// MAIN – 6 segments
// ============================================================================
async function generateMainChunk({ date, topic, tone, index }) {
  const systemPrompt = `
You are writing a MAIN segment for a British artificial intelligence news podcast.
Keep it clear, grounded, and non-technical unless needed.
No markdown, no scene directions, no emojis.
`.trim();

  const userPrompt = `
This is part ${index} of the main section.

Date: ${date || new Date().toISOString()}
Topic: ${topic || "recent developments in artificial intelligence"}
Tone: ${JSON.stringify(tone || { style: "balanced" })}

Explain one distinct angle, risk, opportunity, or human impact.
Write 1–2 short paragraphs.
`.trim();

  return llmCall(`scriptMain-${index}`, [
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt },
  ]);
}

export async function generateMain(args = {}) {
  const segments = [];
  for (let i = 1; i <= 6; i++) {
    // If you ever want fewer segments, just change the loop bound.
    // Keeping 6 to match your existing logging.
    // scriptMain-1 .. scriptMain-6
    const seg = await generateMainChunk({ ...args, index: i });
    segments.push(seg.trim());
  }
  return segments.join("\n\n");
}

// ============================================================================
// OUTRO
// ============================================================================
export async function generateOutro({ date, topic, tone } = {}) {
  const systemPrompt = `
You are writing the OUTRO for a British artificial intelligence news podcast.
Keep it natural, warm, and concise.
No markdown, no scene cues, no sound-effect descriptions.
`.trim();

  const userPrompt = `
Date: ${date || new Date().toISOString()}
Topic: ${topic || "today's artificial intelligence themes"}
Tone: ${JSON.stringify(tone || { style: "balanced" })}

Write a short closing paragraph that thanks the listener,
briefly reinforces the main idea, and signs off naturally.
`.trim();

  return llmCall("scriptOutro", [
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt },
  ]);
}

// ============================================================================
// COMPOSE – intro + main + outro → formatted script
// ============================================================================
export function composeFullScript(intro, main, outro) {
  const raw = `${intro}\n\n${main}\n\n${outro}`.trim();
  return editAndFormat(raw);
}

// ============================================================================
// High-level entry point used by orchestrator
// ============================================================================
export async function generateComposedEpisodeParts(args = {}) {
  const intro = await generateIntro(args);
  const main = await generateMain(args);
  const outro = await generateOutro(args);

  const formatted = composeFullScript(intro, main, outro);

  info("🧠 Script parts generated", {
    date: args.date,
    hasIntro: !!intro,
    hasMain: !!main,
    hasOutro: !!outro,
  });

  return {
    intro,
    main,
    outro,
    formatted,
    callLog,
  };
}

export function getCallLog() {
  return callLog;
}

export default {
  generateIntro,
  generateMain,
  generateOutro,
  composeFullScript,
  generateComposedEpisodeParts,
  getCallLog,
};
