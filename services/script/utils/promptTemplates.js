// ============================================================
// 🎙️ services/script/utils/promptTemplates.js
// ============================================================

import getSponsor from "./getSponsor.js";
import generateCta from "./generateCta.js";
import { getRandomTone } from "./toneSetter.js";
import DurationCalculator from "./durationCalculator.js";

const episodeTone = getRandomTone();

// --- Core Persona ---
const persona = `You are Jonathan Harris, a witty British Gen X host of the podcast "Turing's Torch: AI Weekly".
You speak in a natural, reflective tone — sharp, intelligent, dryly humorous.
You NEVER use stage directions, parenthetical notes, or sound cues.
Your words alone carry the tone — pure transcript form only.`;

// --- INTRO PROMPT ---
export function getIntroPrompt({ weatherSummary, turingQuote, targetMins = 45 }) {
  const introVariants = [
    "Welcome to Turing's Torch: AI Weekly.",
    "You're listening to Turing's Torch: AI Weekly.",
    "This is Turing's Torch: AI Weekly — your spark in the world of AI.",
    "I'm Jonathan Harris, and this is Turing's Torch: AI Weekly — the show where we make sense of machine intelligence.",
  ];
  const selectedIntro = introVariants[Math.floor(Math.random() * introVariants.length)];

  return `${persona}

Write a clean, plain-text intro monologue.

Start with a wry, human observation about the current UK weather:
"${weatherSummary}"

Then flow naturally into this Alan Turing quote:
"${turingQuote}"

Use that quote as a bridge to set the reflective tone for this episode’s ${targetMins}-minute runtime.

Avoid repetition or filler. Conclude with:
"Tired of drowning in AI headlines? Ready for clarity, insight, and a direct line to the pulse of innovation? ${selectedIntro} I'm Jonathan Harris, your host, cutting through the noise to bring you the most critical AI developments, explained, analysed, and delivered straight to you. Let's ignite your understanding of AI, together."

RULES:
- Plain text only — no parenthetical or stage directions.
- Smooth weather → quote → tone transition.
- Keep flow natural and concise.`;
}

// --- MAIN PROMPT ---
export function getMainPrompt({ articles = [], targetDuration = 45 }) {
  const normalizedArticles = Array.isArray(articles)
    ? articles.filter((a) => typeof a === "string" && a.trim().length > 0)
    : typeof articles === "string"
    ? [articles]
    : [];

  const articleCount = normalizedArticles.length;

  const { targetChars, estimatedMinutes } = DurationCalculator.calculateArticleTargets(
    targetDuration,
    articleCount
  );

  const articlePreview = normalizedArticles
    .map((t, i) => `--- ARTICLE ${i + 1} ---\n${t.slice(0, 400)}...`)
    .join("\n\n");

  return `${persona}

Create one seamless spoken monologue (no headings or breaks) about ${articleCount} AI stories.
Each topic should transition organically to the next — the listener should never hear a hard boundary.

DURATION: approximately ${targetDuration} minutes total (${estimatedMinutes.toFixed(1)} expected).

Rules:
- Plain text only — no lists, no "first/second", no cues or brackets.
- Avoid repeated openers like "Right," or "Well,".
- Maintain analytical yet conversational tone.
- Use thematic links: cause/effect, contrast, or question-based transitions.

Source material:
${articlePreview}`;
}

// --- OUTRO PROMPT ---
export async function getOutroPromptFull(targetMins = 45) {
  let book, title, url, cta;
  try {
    book = await getSponsor();
    title = book?.title || "Digital Diagnosis: How AI Is Revolutionizing Healthcare";
    url = book?.url?.replace(/^https?:\/\//, "") || "jonathan-harris.online";
    cta = await generateCta(book);
  } catch {
    title = "Digital Diagnosis: How AI Is Revolutionizing Healthcare";
    url = "jonathan-harris.online";
    cta = "Explore more of my AI work at jonathan-harris.online.";
  }

  const outroVariants = [
    "That’s all for this week’s Turing’s Torch. Keep that curiosity blazing, and I’ll see you next time for more insights that matter. I’m Jonathan Harris—keep building the future.",
    "And that wraps up this week’s Turing’s Torch. Stay curious, keep learning, and I’ll catch you next time. I’m Jonathan Harris—keep building the future.",
  ];
  const selectedOutro = outroVariants[Math.floor(Math.random() * outroVariants.length)];

  return `${persona}

Write a closing monologue for a ${targetMins}-minute episode that flows naturally from the main discussion.

Include:
1. A reflective comment on the episode’s central theme.
2. A subtle personal call-to-action: "${cta}"
3. Mention your book: "${title}" and website: "${url}"
4. Conclude with this paraphrased sign-off: "${selectedOutro}"

STRICT RULES:
- Plain text only — no sound cues, music notes, or formatting.
- Speak URLs naturally (“dot” instead of punctuation).
- Smooth tone, no abrupt ending.`;
}
