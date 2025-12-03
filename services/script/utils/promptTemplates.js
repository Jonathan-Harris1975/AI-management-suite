// ====================================================================
// promptTemplates.js – Updated Editorial Flow Version (Batch Option B)
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

Write a tight, confident radio-style INTRO with a dry, confident British tone:
- Subtle nod to the weather using: "${weatherSummary}" — keep it wry and passing.
- Smoothly introduce this Alan Turing quote: "${turingQuote}" and link it to the mission of demystifying artificial intelligence.
- Maintain a BBC/WIRED editorial energy — sharp, never theatrical.
- No metaphors about "journeys", no stage cues.

End EXACTLY with this tagline:
"${tagline}"
${weekdayLine}
`.trim();
}


// MAIN TEMPLATE – Per-batch mini editorial (used by mainChunker)
export function getMainPrompt({ articles, sessionMeta, targetSeconds, batchIndex, totalBatches }) {
  const persona = buildPersona(sessionMeta);

  const approxSeconds = targetSeconds || 600;
  const approxWords = Math.max(200, Math.round(approxSeconds * 2.3));

  const articlePreview = (articles || [])
    .map((a) => `${a.title}\n${a.summary}`)
    .join("\n\n");

  return `
You are ${persona.host}, hosting "${persona.show}" in a sceptical, witty British radio voice with a Gen-X vibe that is never explicitly named.

You are writing ONE self-contained editorial segment based on the articles below.
This segment will later be combined with other segments into a longer MAIN section, but you must write it as if it stands on its own.

AIM:
- Length: around ${approxWords} words (but do not mention word counts or timing).
- Tone: dry, intelligent, slightly sardonic, but never cruel.
- Style: BBC-meets-WIRED commentary — calm, analytical, conversational.

STRICT RULES:
- Do NOT refer to article numbers or lists. Never say "article 1", "article 2", "story three", etc.
- Do NOT enumerate stories with "first, second, third".
- Do NOT use bullet points or explicit list structures.
- Do NOT refer to "this batch", "this segment", or any internal process.
- Focus on the underlying themes and what these stories collectively suggest.
- Avoid repeating the same point in different words.
- No fictional scenes or hypotheticals — this is editorial analysis, not a sketch.

STRUCTURE:
- Start with one clean line that frames the core issue or mood of these articles.
- Then develop the idea in a few short, spoken-language paragraphs.
- End with a natural, human-sounding closing line that feels complete but not final for the entire show.

ARTICLES (for your eyes only – never reference them directly by number or position):
${articlePreview}

Return ONLY the editorial segment as plain text.
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
Write a reflective OUTRO for "${persona.show}" in a British radio tone with a Gen-X vibe that is never explicitly named.

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
