// ====================================================================
// promptTemplates.js – Updated Editorial Flow Version (Option A)
// ====================================================================

import { buildPersona } from "./toneSetter.js";
import { calculateDuration } from "./durationCalculator.js";

function weekdayFromDateStr(dateStr) {
  try {
    if (!dateStr) return null;
    const [y, m, d] = dateStr.split("-").map(Number);
    const date = new Date(Date.UTC(y, m - 1, d));
    return date.toLocaleString("en-GB", {
      weekday: "long",
      timeZone: "Europe/London",
    });
  } catch {
    return null;
  }
}

// INTRO TEMPLATE
export function getIntroPrompt({ weatherSummary, turingQuote, sessionMeta } = {}) {
  const persona = buildPersona(sessionMeta);
  const maybeWeekday = weekdayFromDateStr(sessionMeta?.date);
  const weekdayLine = maybeWeekday
    ? ` If you reference a day, it must be "${maybeWeekday}".`
    : "";

  const tagline = `Tired of drowning in artificial intelligence headlines? Ready for clarity, insight, and a direct line to the pulse of innovation? Welcome to Turing's Torch: AI Weekly! I'm Jonathan Harris, your host, and I'm cutting through the noise to bring you the most critical artificial intelligence developments, explained, analysed, and delivered straight to you. Let's ignite your understanding of artificial intelligence, together.`;

  return `
You are ${persona.host}, hosting "${persona.show}".

Write a tight, confident radio-style INTRO with a British Gen-X tone:
- Subtle nod to the weather using: "${weatherSummary}" — keep it wry and passing.
- Smoothly introduce this Alan Turing quote: "${turingQuote}" and link it to the mission of demystifying artificial intelligence.
- Maintain a dry BBC/WIRED editorial energy — sharp, never theatrical.
- No metaphors about "journeys", no stage cues.

End EXACTLY with this tagline:
"${tagline}"
${weekdayLine}
`.trim();
}


// MAIN TEMPLATE – Thematic Radio Editorial
export function getMainPrompt({ articles, sessionMeta }) {
  const persona = buildPersona(sessionMeta);

  const articlePreview = (articles || [])
    .map((a, i) => `${i + 1}. ${a.title}\n${a.summary}`)
    .join("\n\n");

  return `
You are ${persona.host}, hosting "${persona.show}" in a sceptical, witty British Gen-X voice.

Write the MAIN SECTION as a professional radio editorial with WIRED-style analysis.

REQUIRED FLOW:
- Read all articles and automatically group them into 2–3 natural themes.
  Examples: AI safety, agentic systems, climate technology, future of work, digital ethics.
- For each theme:
  - Introduce it in one clean sentence.
  - Explain what the grouped stories reveal collectively.
  - Add dry Gen-X commentary — amused, intelligent, not theatrical.
  - Keep transitions smooth and human, like a seasoned radio presenter tying threads together.

AVOID:
- Lists, bullets, or “first we have / next up” style.
- Repeating article text verbatim.
- Abrupt topic jumps.
- Fictional scenes or hypotheticals.
- Generic filler.

STYLE:
- Conversational BBC-meets-Wired vibe.
- Short paragraphs, TTS-friendly.
- Spoken, not written. Clean rhythm. No over-explanation.

ARTICLES:
${articlePreview}

Return plain text only.
`.trim();
}


// OUTRO TEMPLATE – Sponsor → CTA → Sign-off
export function getOutroPromptFull(book, sessionMeta) {
  const persona = buildPersona(sessionMeta);
  const { outroSeconds } = calculateDuration("outro", sessionMeta); // kept for future use

  const rawUrl = book?.url || "https://jonathan-harris.online";
  const spoken = rawUrl
    .replace(/^https?:\/\//, "")
    .replace(/www\./, "")
    .replace(/\./g, " dot ")
    .replace(/-/g, " dash ")
    .replace(/\//g, " slash ")
    .trim();

  const closingTagline = `That's it for this week's Turing's Torch. Keep the flame burning, stay curious, and I'll see you next week with more artificial intelligence insights that matter. I'm Jonathan Harris—keep building the future.`;

  const safeTitle = book?.title || "one of my artificial intelligence ebooks";

  return `
Write a reflective OUTRO for "${persona.show}" in a British Gen-X podcast tone.

Start with a single reflective line that ties together the feel of this week's themes.

Then, without using bullets, naturally segue into the sponsor mention in one or two sentences:
Mention "${safeTitle}", available at ${spoken}, in a conversational way.

Immediately and naturally blend into this CTA as part of the same flow:
"And while you're there, you can sign up for the daily artificial intelligence newsletter — it’s quick, sharp, and blissfully free of fluff."

End EXACTLY with:
"${closingTagline}"

Plain text only.
`.trim();
}

export default { getIntroPrompt, getMainPrompt, getOutroPromptFull };

