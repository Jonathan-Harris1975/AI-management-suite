// ============================================================
// 🧠 RSS Feed Creator — Rewrite Prompts (Simplified + Robust)
// ------------------------------------------------------------
// - Title ≤ 12 words
// - Summary 250–600 characters
// - Neutral tone, no clickbait, emojis, or fluff
// - Output plain text: first line = title, following = summary
// ============================================================

/**
 * System prompt — defines global rewrite rules for all items
 */
export const RSS_PROMPTS = `
You are an expert AI news editor. Rewrite each RSS feed item into a concise,
factual summary suitable for an AI-focused news digest.

Rules:
1. Title: 12 words maximum, factual, no hype or emojis.
2. Body: 250–600 characters, objective, clear, and professional.
3. No clickbait, exclamation marks, or unnecessary adjectives.
4. Focus on what happened, why it matters, or key context.
5. Keep it human-readable and grammatically correct.
6. Do not invent facts or speculate.
7. Return plain text — no JSON, no HTML, no markdown.
8. Format:
   Line 1: Rewritten title (≤12 words)
   Line 2+: Rewritten summary (250–600 characters)
`;

/**
 * Build a per-item user prompt based on raw feed data
 */
export function buildRSSUserPrompt(item = {}) {
  const {
    title,
    link,
    content,
    description,
    summary,
    pubDate,
    isoDate,
    author,
    siteTitle,
  } = item;

  const clean = (t = "") =>
    String(t)
      .replace(/<[^>]*>/g, "")
      .replace(/\s+/g, " ")
      .trim();

  const text =
    clean(content) ||
    clean(description) ||
    clean(summary) ||
    "(No description provided)";

  const lines = [
    `Original title: ${clean(title) || "(none)"}`,
    author ? `Author: ${clean(author)}` : null,
    siteTitle ? `Source: ${clean(siteTitle)}` : null,
    pubDate || isoDate ? `Published: ${pubDate || isoDate}` : null,
    link ? `Link: ${clean(link)}` : null,
    "",
    `Original content:`,
    text,
    "",
    `Rewrite this into a concise AI news brief following the system rules above.`,
  ].filter(Boolean);

  return lines.join("\n");
}

/**
 * Helper to enforce output constraints locally (robust version)
 */
export function normalizeRewrittenItem(result = "") {
  // If the model returned structured data (object with title/summary)
  if (typeof result === "object" && result !== null) {
    const title = String(result.title || "").trim();
    const summary = String(result.summary || "").trim();

    const limitedTitle = title.split(/\s+/).slice(0, 12).join(" ");
    const clampedSummary =
      summary.length < 250
        ? summary.padEnd(250, " ")
        : summary.length > 600
        ? summary.slice(0, 600)
        : summary;

    return { title: limitedTitle, summary: clampedSummary };
  }

  // If the model returned plain text (string)
  if (typeof result === "string") {
    const lines = result.trim().split(/\r?\n/);
    const title = lines.shift()?.trim() || "Untitled";
    const summary = lines.join(" ").trim();

    const limitedTitle = title.split(/\s+/).slice(0, 12).join(" ");
    const clampedSummary =
      summary.length < 250
        ? summary.padEnd(250, " ")
        : summary.length > 600
        ? summary.slice(0, 600)
        : summary;

    return { title: limitedTitle, summary: clampedSummary };
  }

  // Otherwise (invalid or null)
  return { title: "Untitled", summary: "(No summary available)" };
}
