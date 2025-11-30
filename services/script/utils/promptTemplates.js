// services/script/utils/promptTemplates.js
// ============================================================================
// Prompt builders wired to the tone persona + sponsor + durations
// ============================================================================

import getSponsor from "./getSponsor.js";
import { calculateDuration } from "./durationCalculator.js";
import { buildPersona } from "./toneSetter.js";

// Utility: safe weekday name from YYYY-MM-DD
function weekdayFromDateStr(dateStr) {
  try {
    if (!dateStr) return null;
    const [y, m, d] = String(dateStr).split("-").map(Number);
    const date = new Date(Date.UTC(y, m - 1, d));
    return date.toLocaleString("en-GB", {
      weekday: "long",
      timeZone: "Europe/London",
    });
  } catch {
    return null;
  }
}

// Helper: get a sessionId from various shapes of sessionMeta
function getSessionIdFromMeta(sessionMeta) {
  if (!sessionMeta) return "";
  return (
    sessionMeta.sessionId ||
    sessionMeta.session?.sessionId ||
    sessionMeta.id ||
    ""
  );
}

// Helper: get a date string from various shapes of sessionMeta
function getDateFromMeta(sessionMeta) {
  if (!sessionMeta) return null;
  return (
    sessionMeta.date ||
    sessionMeta.session?.date ||
    null
  );
}

// ============================================================================
// INTRO PROMPT
// ============================================================================
export function getIntroPrompt({ weatherSummary, turingQuote, sessionMeta }) {
  const sessionId = getSessionIdFromMeta(sessionMeta);
  const personaText = buildPersona(sessionId); // ← this returns a full persona string
  const maybeWeekday = weekdayFromDateStr(getDateFromMeta(sessionMeta));

  const weekdayLine = maybeWeekday
    ? ` If you mention a day of the week, it must be "${maybeWeekday}".`
    : "";

  const tagline = `Tired of drowning in artificial intelligence headlines? Ready for clarity, insight, and a direct line to the pulse of innovation? Welcome to Turing's Torch: AI Weekly! I'm Jonathan Harris, your host, and I'm cutting through the noise to bring you the most critical artificial intelligence developments, explained, analysed, and delivered straight to you. Let's ignite your understanding of artificial intelligence, together.`;

  const safeWeather =
    weatherSummary ||
    "very typical British weather — feel free to nod to it briefly with a dry aside.";

  const safeQuote =
    turingQuote ||
    `We can only see a short distance ahead, but we can see plenty there that needs to be done.`;

  return `
${personaText}

You are recording the INTRO for an artificial intelligence news podcast.

Tone:
- Dry, witty, British, conversational.
- Gen X sensibility: sceptical but fair, never hysterical.
- Sounds spoken, not written.

You must:
- Subtly reference the weather using this line as inspiration, without sounding like a forecast:
  "${safeWeather}"
- Smoothly weave in this Alan Turing quote at a natural point (not as a list item or label):
  "${safeQuote}"
- Briefly connect the quote to the mission of making artificial intelligence understandable for normal people.
- End EXACTLY with this tagline (do not paraphrase it or change any words):
  "${tagline}"

Rules:
- No music or stage cues.
- No markdown, no bullet points, no headings.
- Output plain text only.${weekdayLine}
`.trim();
}

// ============================================================================
// MAIN PROMPT
// ============================================================================
export function getMainPrompt({ articles = [], sessionMeta }) {
  const sessionId = getSessionIdFromMeta(sessionMeta);
  const personaText = buildPersona(sessionId);

  const articlePreview = articles
    .map((a, i) => {
      const title = a.title || `Story ${i + 1}`;
      const summary = a.summary || a.description || "";
      return `${i + 1}. ${title}\n${summary}`;
    })
    .join("\n\n");

  return `
${personaText}

You are recording the MAIN ANALYSIS section of an artificial intelligence news podcast.

Your style:
- Conversational, intelligent, British Gen X (energy about 2.5/5).
- Think BBC Radio 4 meets Wired UK.
- Lightly witty where appropriate, but never slapstick or theatrical.

Your job:
- Analyse and explain the key stories in a way a smart non-expert can follow.
- Focus on what matters and why, not just what happened.
- Draw out themes and connections between stories where they exist.

Stories to cover:
${articlePreview || "(If no stories are listed, pick 2–3 plausible, non-fictional AI themes and discuss them as if summarising the week's news.)"}

Rules:
- No lists or bullet points in the final output.
- No fictional scenes, no imagined dialogues, no role-play.
- Keep paragraphs short and TTS-friendly (2–4 sentences).
- Do NOT invent extra facts beyond what a well-informed AI commentator might reasonably say.
- Do NOT include headings or markdown.
- Return plain text only.
`.trim();
}

// ============================================================================
// OUTRO PROMPT
// ============================================================================
export function getOutroPromptFull(book, sessionMeta) {
  const sessionId = getSessionIdFromMeta(sessionMeta);
  const personaText = buildPersona(sessionId);

  const { outroSeconds } = calculateDuration("outro", sessionMeta || {});

  const chosenBook =
    book ||
    getSponsor() ||
    {
      title: "my latest book on artificial intelligence",
      url: "https://jonathan-harris.online",
    };

  const rawUrl = chosenBook.url || "https://jonathan-harris.online";
  const spoken = rawUrl
    .replace(/^https?:\/\//, "")
    .replace(/www\./, "")
    .replace(/\./g, " dot ")
    .replace(/-/g, " dash ")
    .replace(/\//g, " slash ")
    .trim();

  const closingTagline = `That's it for this week's Turing's Torch. Keep the flame burning, stay curious, and I'll see you next week with more artificial intelligence insights that matter. I'm Jonathan Harris—keep building the future.`;

  return `
${personaText}

You are recording the OUTRO for this week's episode of "Turing's Torch: AI Weekly".

Structure:
1) A short reflective close on the week's overall feel about artificial intelligence — grounded, not melodramatic.
2) Sponsor mention for this book:
   Title: "${chosenBook.title}"
   Website (paraphrased for speech): ${spoken}
3) Newsletter CTA:
   "And while you're there, you can sign up for the daily artificial intelligence newsletter — it’s quick, sharp, and blissfully free of fluff."
4) End EXACTLY with this closing line (do not alter it):
   "${closingTagline}"

Guidance:
- Aim for roughly ${outroSeconds || 20} seconds of natural speech.
- Keep it conversational, not salesy.
- No raw URLs; speak them in a friendly, human way as above.
- No music or stage directions.
- No markdown, no lists, plain text only.
`.trim();
}

export default { getIntroPrompt, getMainPrompt, getOutroPromptFull };
