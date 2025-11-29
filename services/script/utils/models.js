// ============================================================================
// models.js – FIXED + UPDATED FOR NEW resilientRequest SIGNATURE
// ============================================================================
// - Uses resilientRequest({ routeName, model, messages })
// - Adds safeRouteName() to prevent .startsWith() crashes
// - Ensures callLog stores strings only
// - Keeps all your existing logic intact
// - Fully compatible with orchestrator + editorial pass + format layer
// ============================================================================

import { resilientRequest } from "../../shared/utils/ai-service.js";
import { extractMainContent } from "./textHelpers.js";
import editAndFormat from "./editAndFormat.js";
import { info } from "#logger.js";

// ---------------------------------------------------------------------------
// 🛡️ Helper to ensure routeName is ALWAYS a safe string
// ---------------------------------------------------------------------------
function safeRouteName(name) {
  if (!name) return "unknown";
  if (typeof name === "string") return name;

  try {
    return JSON.stringify(name);
  } catch {
    return String(name);
  }
}

// ---------------------------------------------------------------------------
// Shared call log for debugging
// ---------------------------------------------------------------------------
const callLog = [];
export function getCallLog() {
  return callLog;
}

// ---------------------------------------------------------------------------
// Helper wrapper to ensure we always push valid route names into the log
// ---------------------------------------------------------------------------
async function safeResilientRequest(opts) {
  const { routeName } = opts;

  // Ensure routeName is a string BEFORE the request
  const safeName = safeRouteName(routeName);

  const result = await resilientRequest({
    ...opts,
    routeName: safeName,
  });

  // Ensure logging always uses safe string values
  callLog.push({
    routeName: safeName,
    provider: result?.provider || "unknown",
  });

  return result;
}

// ============================================================================
// 1) INTRO GENERATION
// ============================================================================
export async function generateIntro({ date, topic, tone }) {
  const prompt = `
You are writing the polished INTRO for an artificial intelligence news podcast.
Use a smooth British conversational tone. Avoid hype. Avoid markdown.

Date: ${date}
Topic: ${topic || "latest artificial intelligence trends"}

Tone guidance: ${JSON.stringify(tone || {})}

Write 2–3 short paragraphs.
No scene directions. No emojis. No markdown.
  `.trim();

  const res = await safeResilientRequest({
    routeName: "scriptIntro",
    model: "openai/gpt-4o-mini",
    messages: [{ role: "system", content: prompt }],
    max_tokens: 900,
  });

  return extractMainContent(res?.content || "");
}

// ============================================================================
// 2) MAIN SECTION GENERATION (chunked)
// ============================================================================
async function generateMainChunk({ date, topic, tone, index }) {
  const prompt = `
You are producing MAIN section part ${index} of an artificial intelligence news podcast.

Keep a clear British conversational style.
No music cues, no scene instructions, no markdown.

Date: ${date}
Topic: ${topic || "current artificial intelligence events"}
Tone guidance: ${JSON.stringify(tone || {})}

Write 1–2 paragraphs.
  `.trim();

  const res = await safeResilientRequest({
    routeName: `scriptMain-${index}`,
    model: "google/gemini-2.0-flash-001",
    messages: [{ role: "system", content: prompt }],
    max_tokens: 1200,
  });

  return extractMainContent(res?.content || "");
}

export async function generateMain({ date, topic, tone }) {
  const chunks = [];

  for (let i = 1; i <= 6; i++) {
    const part = await generateMainChunk({ date, topic, tone, index: i });
    chunks.push(part);
  }

  return chunks.join("\n\n");
}

// ============================================================================
// 3) OUTRO GENERATION
// ============================================================================
export async function generateOutro({ date, topic, tone }) {
  const prompt = `
Write an OUTRO for an artificial intelligence podcast.

Tone: smart, British, mildly witty.
Do NOT include any CTAs — the system adds those later.
No markdown. No scene cues.

Date: ${date}
Topic reference: ${topic || "this week's artificial intelligence stories"}
Tone guidance: ${JSON.stringify(tone || {})}

Length: 1 short paragraph.
  `.trim();

  const res = await safeResilientRequest({
    routeName: "scriptOutro",
    model: "google/gemini-2.0-flash-001",
    messages: [{ role: "system", content: prompt }],
    max_tokens: 600,
  });

  return extractMainContent(res?.content || "");
}

// ============================================================================
// 4) COMPOSE FULL SCRIPT (intro → main → outro), apply formatting
// ============================================================================
export function composeFullScript(intro, main, outro) {
  const raw = `${intro}\n\n${main}\n\n${outro}`.trim();
  return editAndFormat(raw);
}

// ============================================================================
// 5) Exported model entry point for orchestrator
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
