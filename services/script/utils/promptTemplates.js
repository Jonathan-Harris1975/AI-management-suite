// services/script/utils/promptTemplates.js

import getSponsor from "./getSponsor.js";
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

export function getIntroPrompt({ weatherSummary, turingQuote, sessionMeta }) {
  const persona = buildPersona(sessionMeta);
  const maybeWeekday = weekdayFromDateStr(sessionMeta?.date);
  const weekdayLine = maybeWeekday ? ` If you mention a day, it must be "${maybeWeekday}".` : "";

  const tagline = `Tired of drowning in artificial intelligence headlines? Ready for clarity, insight, and a direct line to the pulse of innovation? Welcome to Turing's Torch: AI Weekly! I'm Jonathan Harris, your host, and I'm cutting through the noise to bring you the most critical artificial intelligence developments, explained, analysed, and delivered straight to you. Let's ignite your understanding of artificial intelligence, together.`;

  return `
You are ${persona.host}, hosting "${persona.show}".
Write a short, engaging INTRO for an artificial intelligence news podcast.
Tone: dry, witty, British, naturally conversational, not theatrical.

- Reference the weather using: "${weatherSummary}", but weave it in subtly as part of the mood or scene — not as a standalone announcement or forecast.
  It should feel like a passing British observation, mildly amused or wry, not like a weather segment.
- Smoothly segue into this Alan Turing quote: "${turingQuote}".
- Link the quote to the mission of making artificial intelligence understandable for everyone.
- End exactly with this tagline (do not paraphrase it):
  "${tagline}"
- No music/stage cues. Output plain text only.${weekdayLine}
`.trim();
}
export function getMainPrompt({ articles, sessionMeta }) {
  const persona = buildPersona(sessionMeta);

  const articlePreview = articles
    .map((a, i) => `${i + 1}. ${a.title}\n${a.summary}`)
    .join("\n\n");

  return `
You are ${persona.host}, hosting "${persona.show}" in a conversational British Gen-X tone (2.5).

Write the MAIN analysis section using these rules:

TONE:
- Conversational, intelligent, BBC Radio 4 / Wired UK style.
- Lightly witty in places, never theatrical.
- Sounds spoken, not written.

RULES:
- No lists or bullets in the final output.
- No storytelling or fictional scenes.
- Explain clearly what matters and why.
- Connect themes smoothly with natural transitions.
- Keep it factual — no adding new claims.
- Keep paragraphs short and TTS-friendly.
- Target ~600–750 words.

ARTICLES:
${articlePreview}

Return plain text only.
`.trim();
}

export function getOutroPromptFull(book, sessionMeta) {
  const persona = buildPersona(sessionMeta);
  const { outroSeconds } = calculateDuration("outro", sessionMeta);

  const rawUrl = book.url || "https://jonathan-harris.online";
  const spoken = rawUrl
    .replace(/^https?:\/\//, "")
    .replace(/www\./, "")
    .replace(/\./g, " dot ")
    .replace(/-/g, " dash ")
    .replace(/\//g, " slash ")
    .trim();

  const closingTagline = `That's it for this week's Turing's Torch. Keep the flame burning, stay curious, and I'll see you next week with more artificial intelligence insights that matter. I'm Jonathan Harris—keep building the future.`;

  return `
Write a reflective OUTRO for the podcast "${persona.show}" in a British Gen-X tone.

STRUCTURE:
1) A closing line tying together the sense of the week.
2) Sponsor mention: "${book.title}" at ${spoken}.
3) Newsletter CTA:
   "And while you're there, you can sign up for the daily artificial intelligence newsletter — it’s quick, sharp, and blissfully free of fluff."
4) End EXACTLY with:
   "${closingTagline}"

No music cues. Plain text only.
`.trim();
}


export default { getIntroPrompt, getMainPrompt, getOutroPromptFull };
