// ============================================================
// 🧠 RSS Feed Creator — Rewrite Prompts (Gen-X tone, robust)
// ------------------------------------------------------------
// - Title ≤ 12 words
// - Summary 250–600 characters
// - Neutral, concise, "Gen-X" pragmatic tone (no hype)
// - Output plain text:
//     Line 1  => title
//     Line 2+ => summary
// - No JSON/HTML/Markdown
// ============================================================

/**
 * System prompt — global rewrite rules
 * (exported both named and default to satisfy existing imports)
 */
export const SYSTEM = `
You are an expert AI news editor with a pragmatic, Gen-X voice.
Rewrite each RSS feed item into a concise, factual brief for an AI news digest.

Rules:
1) Title: ≤ 12 words. Factual, no hype, no emojis, no exclamation marks.
2) Summary: 250–600 characters. Clear, objective, and useful.
3) Focus on what happened, why it matters, and essential context only.
4) No speculation. Do not invent facts.
5) Style: plain text only — no JSON, HTML, or markdown.

Output format (plain text):
Line 1: Rewritten title (≤12 words)
Line 2+: Rewritten summary (250–600 chars)
`.trim();

/**
 * Build the per-item user prompt from raw feed data.
 * (Function signature kept simple/explicit for the pipeline.)
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

  const lines = [
    `Site: ${clean(site)}`,
    `Original title: ${clean(title) || "(none)"}`,
    published ? `Published: ${published}` : null,
    url ? `Link: ${url}` : null,
    "",
    "Original content:",
    clean(text) || "(No description provided)",
    "",
    "Rewrite this item following the system rules. Remember:",
    `- Title ≤ ${maxTitleWords} words`,
    `- Summary ${minChars}–${maxChars} characters`,
    "",
    "Return plain text only:",
    "Line 1 => title",
    "Line 2+ => summary",
  ].filter(Boolean);

  return lines.join("\n");
}

/**
 * Normalize a raw model response (string) into { title, summary }
 * If the model returns a single line, we treat it as title and leave summary empty.
 */
export function normalizeModelText(result = "") {
  const text = String(result || "").trim();
  if (!text) return { title: "", summary: "" };

  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return { title: "", summary: "" };

  const title = lines.shift() || "";
  const summary = lines.join(" ").trim();
  return { title, summary };
}

/**
 * Enforce output constraints locally (used when we need to clamp)
 */
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

// Back-compat: some modules imported RSS_PROMPTS as a namespace or default.
const RSS_PROMPTS = { SYSTEM, USER_ITEM, normalizeModelText, clampTitleTo12Words, clampSummaryToWindow };
export default RSS_PROMPTS;
