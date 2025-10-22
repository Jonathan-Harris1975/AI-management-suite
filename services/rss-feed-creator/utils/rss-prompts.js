// ============================================================
// 🧠 RSS Feed Creator — Rewrite Prompts (Gen-X tone, robust)
// ------------------------------------------------------------
// - Title ≤ 12 words
// - Summary 250–600 characters
// - Neutral, concise, "Gen-X" pragmatic tone (no hype)
// - Output plain text only
// ============================================================

export const SYSTEM = `
You are an experienced Gen-X AI news editor. Rewrite each RSS item into a short but meaningful brief.

Tone:
- Smart, skeptical, and conversational — think 1990s tech journalist meets modern AI analyst.
- No hype or marketing tone. Slight wit is fine; keep it human.
- Target: 350–800 characters (around 2 short paragraphs).

Rules:
1. Title ≤12 words.
2. Body: 450–1100 characters, complete thought.
3. No emojis or clickbait.
4. Keep facts intact; no speculation.
5. Output plain text:
   Line 1: Title
   Line 2+: Summary.
`;

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
