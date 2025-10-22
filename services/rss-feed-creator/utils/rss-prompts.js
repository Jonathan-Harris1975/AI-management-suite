// ============================================================
// 🧠 RSS Feed Creator — Rewrite Prompts (Gen-X tone, robust)
// ------------------------------------------------------------
// - Title ≤ 12 words
// - Summary 250–600 characters
// - Neutral, concise, "Gen-X" pragmatic tone (no hype)
// - Output plain text only
// ============================================================

/**
 * System prompt — global rewrite rules
 */
export const SYSTEM = `
You are an expert AI news editor with a pragmatic, Gen-X voice.
Rewrite each RSS feed item into a concise, factual brief for an AI-focused news digest.

Tone & Style:
- Mature, clear, and slightly wry; avoid corporate cheerleading or hype.
- Assume readers already know the basics; focus on what’s new or why it matters.
- Avoid buzzwords unless needed. Explain them plainly if used.
- No emojis, clickbait, or exclamation marks.
- One paragraph, plain text, no lists or markdown.

Rules:
1. Title: ≤12 words, factual.
2. Summary: 250–600 characters, objective, readable, human.
3. Stay true to original facts — no speculation.
4. Output plain text only:
   Line 1 → title
   Line 2+ → summary
`.trim();

/**
 * Build a per-item user prompt
 */
export function USER_ITEM({
  site = "AI News",
  title = "",
  url = "",
  text = "",
  published = "",
  maxTitleWords = 12,
  minChars = 250,
  maxChars = 600,
} = {}) {
  const clean = (t = "") =>
    String(t).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();

  return [
    `Site: ${clean(site)}`,
    `Original title: ${clean(title) || "(none)"}`,
    published ? `Published: ${published}` : null,
    url ? `Link: ${url}` : null,
    "",
    "Original content:",
    clean(text) || "(No description provided)",
    "",
    "Rewrite following the system rules above:",
    `• Title ≤ ${maxTitleWords} words`,
    `• Summary ${minChars}–${maxChars} characters`,
    "",
    "Return plain text only:",
    "Line 1 → title",
    "Line 2+ → summary",
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * Parse a raw model response (string) into { title, summary }
 */
export function normalizeModelText(result = "") {
  const text = String(result || "").trim();
  if (!text) return { title: "", summary: "" };

  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const title = lines.shift() || "";
  const summary = lines.join(" ").trim();
  return { title, summary };
}

/** Clamp helpers */
export function clampTitleTo12Words(title = "") {
  const words = title.trim().split(/\s+/);
  return words.length <= 12 ? title.trim() : words.slice(0, 12).join(" ");
}

export function clampSummaryToWindow(summary = "", min = 250, max = 600) {
  const t = String(summary).trim().replace(/\s+/g, " ");
  if (!t) return "";
  if (t.length <= max) return t;
  const cutoff = t.lastIndexOf(".", max);
  return cutoff > Math.max(200, min) ? t.slice(0, cutoff + 1) : t.slice(0, max);
}

/**
 * ✅ Provide both a default and a named export for compatibility
 */
export const RSS_PROMPTS = {
  SYSTEM,
  USER_ITEM,
  normalizeModelText,
  clampTitleTo12Words,
  clampSummaryToWindow,
};

export default RSS_PROMPTS;
