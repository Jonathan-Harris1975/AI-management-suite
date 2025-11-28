import getSponsor from "./getSponsor.js";
import { calculateDuration } from "./durationCalculator.js";
import { buildPersona } from "./toneSetter.js";

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

export function getIntroPrompt({ weatherSummary, turingQuote, sessionMeta } = {}) {
  const persona = buildPersona(sessionMeta);
  const maybeWeekday = weekdayFromDateStr(sessionMeta?.date);
  const weekdayLine = maybeWeekday
    ? ` If you mention a day, it must be "${maybeWeekday}".`
    : "";

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

export function getMainPrompt(options = {}) {
  const { sessionMeta, mainSeconds, articles } = options;

  const persona = buildPersona(sessionMeta);

  const list = Array.isArray(articles) ? articles : [];
  const safeSeconds =
    typeof mainSeconds === "number" && Number.isFinite(mainSeconds) && mainSeconds > 0
      ? mainSeconds
      : 600; // sensible default (~10 minutes)

  const targetWords = Math.max(500, Math.round(safeSeconds / 0.8));

  const articlePreview = list
    .map((a, i) => {
      if (!a) return "";
      const title = a.title || `Story ${i + 1}`;
      const summary = a.summary || a.description || "";
      const link = a.link || "";
      return `${i + 1}. ${title}\n   ${summary}\n   Source: ${link}`;
    })
    .filter(Boolean)
    .join("\n\n");

  return `
You are ${persona.host}, hosting "${persona.show}" with a ${persona.tone} style.
Generate an analytical MAIN section strictly from the provided articles below.

RULES:
- Output plain text only (no lists in the final text, no bullets or numbering).
- No storytelling, fiction, vignettes, or scene-setting.
- Provide clear, insightful synthesis: what happened, why it matters, credible caveats.
- Attribute sources briefly in-line (by outlet name if known).
- Aim for around ${targetWords} words (~${Math.round(
    safeSeconds / 60
  )} minutes).
- Organise into short paragraphs with smooth transitions between themes.
- Do not repeat the intro tagline or any outro elements.

ARTICLES:
${articlePreview}
`.trim();
}

function makeSpokenUrl(rawUrl) {
  return rawUrl
    .replace(/^https?:\/\//, "")
    .replace(/www\./, "")
    .replace(/\./g, " dot ")
    .replace(/-/g, " dash ")
    .replace(/\//g, " slash ")
    .trim();
}

export async function getOutroPromptFull(sessionMeta) {
  const persona = buildPersona(sessionMeta);
  const { outroSeconds } = calculateDuration("outro", sessionMeta);

  let book = null;
  try {
    const maybe = getSponsor();
    book = typeof maybe?.then === "function" ? await maybe : maybe;
  } catch {
    book = null;
  }

  const title =
    book?.title || "AI in Manufacturing: Modernizing Operations and Maintenance";

  const rawUrl = book?.url || "https://jonathan-harris.online";
  const spokenUrl = makeSpokenUrl(rawUrl);

  const closingTagline = `That's it for this week's Turing's Torch. Keep the flame burning, stay curious, and I'll see you next week with more artificial intelligence insights that matter. I'm Jonathan Harris—keep building the future.`;

  return `
You are ${persona.host}, closing "${persona.show}" in a ${persona.tone} tone.
Write a clean, reflective OUTRO (plain text only) that follows this structure:

1) A brief reflective closing line about the week's themes (no new stories).
2) A natural sponsor mention, for example:
   If you'd like to explore this further, check out "${title}" at ${spokenUrl}.
3) Do not add any additional promotional call-to-action beyond the sponsor mention above.
4) End exactly with this tagline (do not paraphrase it):
   "${closingTagline}"

Keep within ~${Math.round(outroSeconds / 60)} minute of spoken delivery.
No music/stage cues.
`.trim();
}

export default { getIntroPrompt, getMainPrompt, getOutroPromptFull };
