// ============================================================
// 🎙️ services/script/utils/promptTemplates.js
// ============================================================
//
// Generates AI prompt templates for each podcast section.
// - Shared persona and tone per episode
// - Auto-rotating duration only for MAIN section
// - Strict plain-text output, no cues or formatting
// ============================================================

import getSponsor from "./getSponsor.js";
import generateCta from "./generateCta.js";
import { buildPersona } from "./toneSetter.js";
import { calculateDuration } from "./durationCalculator.js"; // ✅ fixed import

// ─────────────────────────────────────────────────────────────
// 🧩 INTRO PROMPT (Fixed Duration)
// ─────────────────────────────────────────────────────────────
export function getIntroPrompt({ weatherSummary, turingQuote, sessionId }) {
  const persona = buildPersona(sessionId);
  const intros = [
    "Welcome to Turing's Torch: AI Weekly.",
    "You're listening to Turing's Torch: AI Weekly.",
    "This is Turing's Torch: AI Weekly — your spark in the world of AI.",
    "I'm Jonathan Harris, and this is Turing's Torch: AI Weekly — the show where we make sense of machine intelligence.",
  ];
  const selectedIntro = intros[Math.floor(Math.random() * intros.length)];

  return `${persona}

Write a clean, plain-text intro monologue.

Start with a witty, observational remark about the UK weather:
"${weatherSummary}"

Then flow naturally into this Alan Turing quote:
"${turingQuote}"

Use the quote as a bridge into the episode’s introduction:
"Tired of drowning in AI headlines? Ready for clarity, insight, and a direct line to the pulse of innovation? ${selectedIntro} I'm Jonathan Harris, your host, cutting through the noise to bring you the most critical AI developments, explained, analysed, and delivered straight to you. Let's ignite your understanding of AI, together."

RULES:
- Plain text only — no parenthetical notes, stage cues, or formatting.
- Smooth weather → quote → tone transition.
- Keep it conversational, concise, and authentic.`;
}

// ─────────────────────────────────────────────────────────────
// 🧩 MAIN PROMPT (Dynamic Duration + Shared Tone)
// ─────────────────────────────────────────────────────────────
export async function getMainPrompt({ articles = [], sessionId }) {
  const persona = buildPersona(sessionId);

  const normalized = Array.isArray(articles)
    ? articles.filter((a) => typeof a === "string" && a.trim().length > 0)
    : typeof articles === "string"
    ? [articles]
    : [];

  const articleCount = normalized.length;

  // 🔄 Automatically calculate and normalize duration for MAIN
  const { targetMins } = await calculateDuration(sessionId, "main");

  console.log(
    `🕒 Runtime target: ${targetMins} min for ${articleCount} article${
      articleCount === 1 ? "" : "s"
    }`
  );

  const articlePreview = normalized
    .map((t, i) => `--- ARTICLE ${i + 1} ---\n${t.slice(0, 400)}...`)
    .join("\n\n");

  return `${persona}

Create a single, continuous spoken monologue covering ${articleCount} AI stories.
The listener should never detect where one story ends and another begins.

TARGET LENGTH: ~${targetMins} minutes.

RULES:
- Plain text only (no lists, markdown, or formatting)
- Maintain consistent tone for this entire episode
- Use smooth, natural transitions (cause/effect, contrast, curiosity)
- Never enumerate or label sections

Source material:
${articlePreview}`;
}

// ─────────────────────────────────────────────────────────────
// 🧩 OUTRO PROMPT (Fixed Duration + Shared Tone)
// ─────────────────────────────────────────────────────────────
export async function getOutroPromptFull(sessionId) {
  const persona = buildPersona(sessionId);
  let book, title, url, cta;

  try {
    book = await getSponsor();
    title = book?.title || "Digital Diagnosis: How AI Is Revolutionizing Healthcare";
    url = book?.url?.replace(/^https?:\/\//, "") || "jonathan-harris.online";
    cta = await generateCta(book);
  } catch (err) {
    console.error("⚠️ Failed to load sponsor info:", err);
    title = "Digital Diagnosis: How AI Is Revolutionizing Healthcare";
    url = "jonathan-harris.online";
    cta = "Explore my latest AI eBooks at jonathan-harris.online.";
  }

  const outros = [
    "That’s all for this week’s Turing’s Torch. Keep that curiosity blazing, and I’ll see you next time. I’m Jonathan Harris—keep building the future.",
    "And that wraps up this week’s Turing’s Torch. Stay curious, keep learning, and I’ll catch you next time. I’m Jonathan Harris—keep building the future.",
  ];
  const selectedOutro = outros[Math.floor(Math.random() * outros.length)];

  return `${persona}

Write a closing monologue that flows naturally from the main discussion.

Include:
1. A short reflection on the episode's main theme.
2. A subtle personal call-to-action: "${cta}"
3. Mention your book "${title}" and website "${url}"
4. End with this paraphrased sign-off: "${selectedOutro}"

RULES:
- Plain text only (no cues, stage directions, or formatting)
- Keep tone consistent with intro and main sections.
- Speak URLs naturally using “dot” instead of punctuation.`;
}

// ─────────────────────────────────────────────────────────────
// 🧩 EXPORTS
// ─────────────────────────────────────────────────────────────
export default {
  getIntroPrompt,
  getMainPrompt,
  getOutroPromptFull,
};
