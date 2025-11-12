// ============================================================
// 🎙️ services/script/utils/promptTemplates.js
// ============================================================
// - Dynamic British intro flow with weather + Turing quote
// - Fixed intro/outro taglines (verbatim)
// - Main prompts work for both whole-run and chunked generation
// - Outro includes sponsor + CTA + closing tagline
// ============================================================

import getSponsor from "./getSponsor.js";
import generateCta from "./generateCta.js";
import { calculateDuration } from "./durationCalculator.js";
import { buildPersona } from "./toneSetter.js";

function weekdayFromDateStr(dateStr) {
  try {
    if (!dateStr) return null;
    const [y, m, d] = dateStr.split("-").map(Number);
    const date = new Date(Date.UTC(y, m - 1, d));
    return date.toLocaleString("en-GB", { weekday: "long", timeZone: "Europe/London" });
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────
// INTRO (Dynamic with British weather & tagline)
// ─────────────────────────────────────────────────────────────
export function getIntroPrompt({ weatherSummary, turingQuote, sessionMeta }) {
  const persona = buildPersona(sessionMeta);
  const maybeWeekday = weekdayFromDateStr(sessionMeta?.date);
  const weekdayLine = maybeWeekday ? ` If you mention a day, it must be "${maybeWeekday}".` : "";

  const tagline = `Tired of drowning in AI headlines? Ready for clarity, insight, and a direct line to the pulse of innovation? Welcome to Turing's Torch: AI Weekly! I'm Jonathan Harris, your host, and I'm cutting through the noise to bring you the most critical AI developments, explained, analysed, and delivered straight to you. Let's ignite your understanding of AI, together.`;

  return `
You are ${persona.host}, hosting "${persona.show}".
Write a short, engaging INTRO for an AI news podcast.
Tone: dry, witty, British, reflective, conversational.

- Begin with a wry British comment about the weather using: "${weatherSummary}".
  Even if the weather is nice, sound mildly unimpressed or ironic.
- Naturally segue into this Alan Turing quote: "${turingQuote}".
- Smoothly connect the quote to the theme of understanding AI for everyone.
- End **exactly** with this tagline (do not paraphrase it):
  "${tagline}"
- No music/stage cues. Output plain text only.${weekdayLine}
`.trim();
}

// ─────────────────────────────────────────────────────────────
// MAIN (used for both single-shot and chunked mode)
// ─────────────────────────────────────────────────────────────
export function getMainPrompt({ sessionMeta, articles, mainSeconds }) {
  const persona = buildPersona(sessionMeta);
  // approx 0.8s per word speaking pace (conservative)
  const targetWords = Math.max(500, Math.round(mainSeconds / 0.8));
  const articlePreview = articles.map((a, i) => {
    const summary = a.summary || a.description || "";
    const link = a.link || "";
    return `${i + 1}. ${a.title}\n   ${summary}\n   Source: ${link}`;
  }).join("\n\n");

  return `
You are ${persona.host}, hosting "${persona.show}" with a ${persona.tone} style.
Generate an analytical MAIN section strictly from the provided articles below.

RULES:
- Output plain text only (no lists in the final text, no bullets or numbering).
- No storytelling, fiction, vignettes, or scene-setting.
- Provide clear, insightful synthesis: what happened, why it matters, credible caveats.
- Attribute sources briefly in-line (by outlet name if known).
- Aim for around ${targetWords} words (~${Math.round(mainSeconds / 60)} minutes).
- Organise into short paragraphs with smooth transitions between themes.
- Do not repeat the intro tagline or any outro elements.

ARTICLES:
${articlePreview}
`.trim();
}

// ─────────────────────────────────────────────────────────────
// OUTRO (Sponsor + CTA + fixed closing tagline)
// ─────────────────────────────────────────────────────────────
export async function getOutroPromptFull(sessionMeta) {
  const persona = buildPersona(sessionMeta);
  const { outroSeconds } = calculateDuration("outro", sessionMeta);

  // Works whether getSponsor() is sync or async
  let book = null;
  try {
    const maybe = getSponsor();
    book = typeof maybe?.then === "function" ? await maybe : maybe;
  } catch {
    book = null;
  }

  const title = book?.title || "AI in Manufacturing: Modernizing Operations and Maintenance";
  const url = (book?.url || "https://jonathan-harris.online").replace(/^https?:\/\//, "");
  const cta = generateCta({ title, url });

  const closingTagline = `That's it for this week's Turing's Torch. Keep the flame burning, stay curious, and I'll see you next week with more AI insights that matter. I'm Jonathan Harris—keep building the future.`;

  return `
You are ${persona.host}, closing "${persona.show}" in a ${persona.tone} tone.
Write a clean, reflective OUTRO (plain text only) that follows this structure:

1) A brief reflective closing line about the week's themes (no new stories).
2) A natural sponsor mention, e.g.:
   If you'd like to explore this further, check out "${title}" at jonathan-harris dot online.
3) Include this CTA naturally: "${cta}"
4) End **exactly** with this tagline (do not paraphrase it):
   "${closingTagline}"

Keep within ~${Math.round(outroSeconds / 60)} minute of spoken delivery.
No music/stage cues.
`.trim();
}

export default { getIntroPrompt, getMainPrompt, getOutroPromptFull };
