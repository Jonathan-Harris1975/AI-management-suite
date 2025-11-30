// ============================================================================
// services/script/utils/models.js
// Unified script model layer for Turing's Torch
// ----------------------------------------------------------------------------
// - Uses new resilientRequest(routeName, { ...opts }) signature
// - Intro / main / outro generation with context from orchestrator
// - Keeps things TTS-friendly (no markdown, no cues, no emojis)
// - Final pass through editAndFormat for pacing + light humanisation
// ============================================================================

import { resilientRequest } from "../../shared/utils/ai-service.js";
import { extractMainContent } from "./textHelpers.js";
import editAndFormat from "./editAndFormat.js";
import { info } from "#logger.js";

// ---------------------------------------------------------------------------
// Shared call log (for meta/debug)
// ---------------------------------------------------------------------------
const callLog = [];

export function getCallLog() {
  // Return a shallow copy so we don't leak internal array
  return [...callLog];
}

function resetCallLog() {
  callLog.length = 0;
}

// ---------------------------------------------------------------------------
// Core LLM caller
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

  // ai-service returns a plain string content; normalise & strip cruft
  const main = extractMainContent(content || "");
  callLog.push(routeName);
  return main;
}

// ============================================================================
// 1) INTRO
// ============================================================================
export async function generateIntro(ctx = {}) {
  const {
    sessionId,
    date,
    topic,
    tone,
    weatherSummary,
    turingQuote,
    introTagline,
    sponsorBook,
  } = ctx;

  const safeTopic =
    topic || "the most important artificial intelligence stories of the week";

  const safeWeather =
    weatherSummary ||
    "typical British weather — keep any reference short and conversational.";

  const safeQuote =
    turingQuote ||
    `We can only see a short distance ahead, but we can see plenty there that needs to be done.`;

  const taglineLine =
    introTagline ||
    `Tired of drowning in artificial intelligence headlines and hype? ` +
      `Welcome to Turing's Torch: AI Weekly. I'm Jonathan Harris, here to cut through the noise.`;

  const sponsorLine = sponsorBook
    ? `This week's featured book is "${sponsorBook.title}". ` +
      `You don't need to give the URL yet; just tease that there'll be a quick mention later in the show.`
    : `You don't need to mention any sponsors explicitly unless it feels natural.`;

  const prompt = `
You are writing the SPOKEN INTRO for an artificial intelligence news podcast.

Show: "Turing's Torch: AI Weekly"
Host: Jonathan Harris (British, Gen X, dry wit, no hype).

Today:
- Date: ${date || "today"}
- Main theme: ${safeTopic}
- Weather summary to optionally nod to in a single short phrase: ${safeWeather}
- Alan Turing quote to weave in naturally once: "${safeQuote}"

Open with a natural version of this tagline (you may paraphrase but keep the spirit and keep it short):
"${taglineLine}"

${sponsorLine}

Tone guidance (JSON):
${JSON.stringify(tone || {}, null, 2)}

Rules:
- Use a natural British conversational style.
- No markdown, no headings, no bullet points, no stage directions.
- Do NOT say any URLs aloud.
- No sound cues like [music] or (sfx).
- 2–3 short paragraphs, each 2–4 sentences.
- Make it sound like a real human host warming up the listener, not reading a press release.
  `.trim();

  const text = await callLLM("scriptIntro", {
    sessionId,
    section: "intro",
    prompt,
    maxTokens: 900,
  });

  return text;
}

// ============================================================================
// 2) MAIN – chunked into 6 parts for more control
// ============================================================================
async function generateMainChunk(index, ctx = {}) {
  const { sessionId, date, topic, tone, weatherSummary, turingQuote } = ctx;

  const safeTopic =
    topic || "the most important artificial intelligence developments of the week";

  const prompt = `
You are writing MAIN SECTION PART ${index} of an artificial intelligence news podcast.

Assume the listener has just heard an intro that:
- Set up the theme: ${safeTopic}
- Briefly nodded to the weather: ${weatherSummary || "use a generic British aside if needed"}
- Referenced Alan Turing with this quote: "${turingQuote || ""}"

Your job in this part:
- Dig into one important angle or story that fits the overall theme.
- Explain clearly but conversationally, as if to a smart non-expert.
- Add light British humour or dry asides, but don't overdo it.

Tone guidance (JSON):
${JSON.stringify(tone || {}, null, 2)}

Rules:
- Smart, opinionated, but not shouty.
- No markdown, no scene directions, no emojis.
- No explicit CTAs here – save those for the outro.
- Do NOT say any URLs aloud.
- 1–2 paragraphs, each 3–5 sentences.
  `.trim();

  const routeName = `scriptMain-${index}`;

  const text = await callLLM(routeName, {
    sessionId,
    section: `main-${index}`,
    prompt,
    maxTokens: 1200,
  });

  return text;
}

export async function generateMain(ctx = {}) {
  const chunks = [];

  for (let i = 1; i <= 6; i++) {
    const part = await generateMainChunk(i, ctx);
    chunks.push(part);
  }

  return chunks.join("\n\n");
}

// ============================================================================
// 3) OUTRO
// ============================================================================
export async function generateOutro(ctx = {}) {
  const {
    sessionId,
    date,
    topic,
    tone,
    sponsorBook,
    sponsorCta,
    closingTagline,
  } = ctx;

  const safeTopic =
    topic || "the broader implications of artificial intelligence this week";

  const sponsorLine = sponsorBook
    ? `We are featuring the book "${sponsorBook.title}". ` +
      `You should briefly remind listeners what it's about, and naturally lead into this CTA:\n` +
      `"${sponsorCta || ""}"\n` +
      `Don't read any long URLs; just refer to "the link in the show notes or on my website".`
    : `If there is no sponsor, just give a short, low-key reminder that listeners can find more details and links in the show notes.`;

  const tagline =
    closingTagline ||
    `That's it for this week's Turing's Torch: AI Weekly — your Gen-X guide to artificial intelligence without the fluff. ` +
      `I'm Jonathan Harris; thanks for listening, and keep building the future without losing your mind in the headlines.`;

  const prompt = `
Write the OUTRO for this week's episode of "Turing's Torch: AI Weekly".

Context:
- Date: ${date || "today"}
- Main theme covered: ${safeTopic}

You must:
- Give a short, natural wrap-up of the theme.
- Thank the listener in a genuine but not cheesy way.
- Include a brief sponsor/CTA moment based on this guidance:
${sponsorLine}

Finally, close with a natural-sounding version of this tagline (paraphrasing is allowed, but keep the meaning):
"${tagline}"

Tone guidance (JSON):
${JSON.stringify(tone || {}, null, 2)}

Rules:
- 2–3 short paragraphs.
- No markdown, no emojis, no sound cues.
- Do NOT say any raw URLs; refer to "show notes" or "my website" instead.
  `.trim();

  const text = await callLLM("scriptOutro", {
    sessionId,
    section: "outro",
    prompt,
    maxTokens: 800,
  });

  return text;
}

// ============================================================================
// 4) COMPOSE FULL SCRIPT + format/humanise
// ============================================================================
export function composeFullScript(intro, main, outro) {
  const raw = `${intro}\n\n${main}\n\n${outro}`.trim();
  return editAndFormat(raw);
}

// ============================================================================
// 5) High-level entry point used by orchestrator
// ============================================================================
export async function generateComposedEpisodeParts(ctx = {}) {
  resetCallLog();

  const intro = await generateIntro(ctx);
  const main = await generateMain(ctx);
  const outro = await generateOutro(ctx);

  const formatted = composeFullScript(intro, main, outro);
  const callLogSnapshot = getCallLog();

  info("script.models.complete", {
    sessionId: ctx.sessionId,
    calls: callLogSnapshot,
  });

  return {
    intro,
    main,
    outro,
    formatted,
    callLog: callLogSnapshot,
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
