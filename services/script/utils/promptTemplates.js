// ============================================================
// 🎙️ services/script/utils/promptTemplates.js
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

export function getIntroPrompt({ weatherSummary, turingQuote, sessionMeta }) {
  const persona = buildPersona(sessionMeta);
  const maybeWeekday = weekdayFromDateStr(sessionMeta?.date);
  const weekdayLine = maybeWeekday ? ` If you mention a day, it must be "${maybeWeekday}".` : "";

  return `
You are ${persona.host}, hosting the show "${persona.show}".
Write a short, engaging INTRO for an AI news podcast.
- Keep it ${persona.tone}.
- Mention the current weather as: "${weatherSummary}" (do not add temperature).
- Include a single Alan Turing quote: "${turingQuote}".
- No music/stage cues. Plain text only.
- Smoothly transition from the weather → to the quote → to welcoming the listener.${weekdayLine}
`.trim();
}

export function getMainPrompt({ sessionMeta, articles, mainSeconds }) {
  const persona = buildPersona(sessionMeta);
  const articlePreview = articles
    .slice(0, Math.max(3, Math.min(6, articles.length)))
    .map((a, i) => `${i + 1}. ${a.title}\n   ${a.summary || a.description || ""}\n   Source: ${a.link}`)
    .join("\n\n");

  return `
You are ${persona.host}, hosting "${persona.show}" with a ${persona.tone} style.
Generate the MAIN section strictly from the provided articles below.

RULES:
- Output plain text only.
- No storytelling or fiction.
- Summarize the most important developments clearly.
- Attribute sources briefly in-line.
- Keep this within ~${Math.round(mainSeconds / 60)} minutes of spoken delivery.

ARTICLES:
${articlePreview}
`.trim();
}

export async function getOutroPromptFull(sessionMeta) {
  const persona = buildPersona(sessionMeta);
  const { outroSeconds } = calculateDuration("outro", sessionMeta);
  const book = await getSponsor().catch(() => null);
  const title = book?.title || "AI in Manufacturing: Modernizing Operations and Maintenance";
  const url = (book?.url || "https://jonathan-harris.online").replace(/^https?:\/\//, "");
  const cta = generateCta({ title, url });

  return `
You are ${persona.host}, closing "${persona.show}" in a ${persona.tone} style.
Write a clean OUTRO (plain text only) that:
- Thanks the listener, gives a brief recap.
- Mentions "${title}" naturally, with the link "jonathan-harris dot online".
- Includes: "${cta}"
- No music cues, within ~${Math.round(outroSeconds / 60)} minute of spoken delivery.
`.trim();
}

export default { getIntroPrompt, getMainPrompt, getOutroPromptFull };
