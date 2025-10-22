// ============================================================
// 🧠 RSS Feed Creator — Gen-X Tone, Long-Form Prompt
// ------------------------------------------------------------
// - Title ≤ 12 words, plain text only
// - Summary 300–1100 characters (≈ 60–200 words)
// - Human, skeptical, “Gen-X tech journalist” tone
// - No HTML, markdown, or emojis
// ============================================================

export const SYSTEM = `
You are an experienced Gen-X technology journalist writing for an AI-focused audience.

Rewrite each RSS feed item into a clear, factual, paragraph-length brief.

Tone & Style:
- Witty in a dry, skeptical, British-Gen-X way (think Wired UK 1999 meets The Register 2005).
- Conversational but precise. Smart, grounded, slightly cynical.
- Avoid hype, marketing, or emojis.
- Plain UTF-8 text only — no tags, quotes, or formatting codes.

Rules:
1. Title: ≤ 12 words. Keep human and direct, no clickbait or punctuation gimmicks.
2. Summary: 300–1100 characters (~60–200 words).
   - Use full sentences.
   - Cover: what happened, context, significance.
   - No lists, bullet points, or HTML.
3. Output plain text only:
   Line 1 → rewritten title
   Line 2+ → rewritten summary
`.trim();

export function USER_ITEM({
  site = "AI News",
  title = "",
  url = "",
  text = "",
  published = "",
  maxTitleWords = 12,
  minChars = 300,
  maxChars = 1100,
} = {}) {
  const clean = (t = "") =>
    String(t).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();

  return [
    `Source: ${clean(site)}`,
    `Original title: ${clean(title)}`,
    published ? `Published: ${published}` : null,
    url ? `Link: ${url}` : null,
    "",
    "Original text:",
    clean(text) || "(No description provided)",
    "",
    `Rewrite following the system rules above. Produce plain text only (no quotes, no HTML).`,
    `Target length: ${minChars}-${maxChars} characters.`,
  ]
    .filter(Boolean)
    .join("\n");
}

export function normalizeModelText(result = "") {
  const text = String(result || "").replace(/[“”‘’]/g, "'").trim();
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const title = lines.shift() || "";
  const summary = lines.join(" ").trim();
  return { title, summary };
}

export function clampTitleTo12Words(title = "") {
  const words = title.replace(/[“”‘’]/g, "'").split(/\s+/);
  return words.slice(0, 12).join(" ").trim();
}

export function clampSummaryToWindow(summary = "", min = 300, max = 1100) {
  const t = String(summary).replace(/\s+/g, " ").trim();
  if (!t) return "";
  if (t.length < min) return t.padEnd(min, " ");
  if (t.length <= max) return t;
  const cutoff = t.lastIndexOf(".", max);
  return cutoff > min ? t.slice(0, cutoff + 1) : t.slice(0, max);
}

export const RSS_PROMPTS = {
  SYSTEM,
  USER_ITEM,
  normalizeModelText,
  clampTitleTo12Words,
  clampSummaryToWindow,
};

export default RSS_PROMPTS;
