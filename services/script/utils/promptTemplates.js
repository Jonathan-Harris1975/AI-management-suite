// services/script/utils/promptTemplates.js

import { buildPersona, getClosingTagline } from "./toneSetter.js";
import { calculateDuration } from "./durationCalculator.js"; // { calculateDuration } export is correct

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

export function buildIntroPrompt({
  sessionId,
  date,
  weatherSummary,
  turingQuote,
}) {
  const persona = buildPersona(sessionId);
  const weekday = date ? weekdayFromDateStr(date.slice(0, 10)) : null;

  const dateLine = weekday
    ? `It is ${weekday}, ${date}.`
    : date
    ? `The date is ${date}.`
    : "";

  const weatherLine = weatherSummary
    ? `Open with a single, light reference to today’s weather: ${weatherSummary}.`
    : "You may optionally nod to the UK weather in one short line.";

  const turingLine = turingQuote
    ? `Weave in this Alan Turing quote in a natural way, once only: "${turingQuote}".`
    : "If you reference Alan Turing, do it once and keep it sharp.";

  return `
${persona}

Write a short INTRO for the podcast episode. Spoken, not read.
${dateLine}

Requirements:
- Set up that this is a weekly AI news and analysis round-up.
- Emphasise that you cut through hype, marketing fluff, and doom.
- ${weatherLine}
- ${turingLine}
- No section headings, no bullet points, no sound cues.
- Finish with a natural transition into the main stories (but do not list them).
`.trim();
}

export function buildMainPrompt({
  sessionId,
  articles,
}) {
  const persona = buildPersona(sessionId);
  const list = Array.isArray(articles) ? articles : [];

  const { targetMins } = calculateDuration("main", sessionId, list.length);

  const articleLines =
    list
      .slice(0, 6)
      .map(
        (a, i) =>
          `${i + 1}) ${a.title} — ${a.link || ""} (${a.source || "unknown source"})`,
      )
      .join("\n") || "No specific headlines available; focus on general AI trends.";

  return `
${persona}

You are presenting the MAIN BODY of the episode.
Here are the candidate stories and links for context:

${articleLines}

Guidelines:
- Aim for about ${targetMins} minutes of spoken content in total.
- Group related stories together so it feels like a coherent narrative.
- For each story you choose to cover:
  - Explain what happened in plain English.
  - Add context: why it matters and who it affects.
  - Offer a short Gen-X style opinion — dry humour allowed, but no cruelty.
- You do NOT need to cover all stories; depth is better than breadth.
- Do not reference URLs out loud; if you must mention a site, say the name only.
- No headings, bullet points, or stage directions.
`.trim();
}

export function buildOutroPrompt({
  sessionId,
  sponsorBook,
  sponsorCta,
}) {
  const persona = buildPersona(sessionId);
  const closingTagline = getClosingTagline();

  let sponsorLine;

  if (sponsorBook && sponsorBook.title) {
    const safeTitle = sponsorBook.title;
    const safeCta = sponsorCta || "";

    sponsorLine = `
Give a short, sincere promo for the book "${safeTitle}".
Paraphrase this call-to-action in natural spoken English, without sounding robotic:
"${safeCta}"
Do NOT spell out "https" or any full URL protocol; keep it listener-friendly and conversational.
`.trim();
  } else {
    sponsorLine =
      "Give a short, sincere one-line plug for Jonathan Harris's AI ebooks on Amazon. Keep it natural and conversational.";
  }

  return `
${persona}

Write a short OUTRO to close the episode.

Structure:
1) Reflect briefly on the week in artificial intelligence and what still feels uncertain.
2) ${sponsorLine}
3) Newsletter CTA:
   Encourage listeners to visit jonathan-harris dot online for the newsletter and more.
4) Invite them to follow or subscribe in their podcast app.
5) End EXACTLY with:
   "${closingTagline}"

Plain text only.
No headings, no bullet points, no sound cues.
`.trim();
}

export default {
  buildIntroPrompt,
  buildMainPrompt,
  buildOutroPrompt,
};
