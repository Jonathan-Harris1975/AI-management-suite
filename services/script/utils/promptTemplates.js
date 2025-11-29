// ====================================================================
// promptTemplates.js – Full Production Version
// ====================================================================
// MAIN: Conversational British Gen-X (tone 2.5)
// OUTRO A: Random sponsor + newsletter CTA (N 2.5)
// INTRO: Left unchanged
// ====================================================================

import { buildPersona } from "./toneSetter.js";
import { calculateDuration } from "./durationCalculator.js";

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

export function getIntroPrompt() {
  return "Intro logic unchanged — handled upstream.";
}
