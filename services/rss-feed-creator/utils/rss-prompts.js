// ============================================================
// 🧠 RSS Feed Creator — Gen-X Tone, Long-Form Prompt (OpenRouter Optimized)
// ============================================================

import { warn } from "#logger.js";
//
// Automatically pulls summary length limits from environment vars:
// MIN_SUMMARY_CHARS / MAX_SUMMARY_CHARS
//
// Defaults to 300–1100 if env not set.
// Enforces strict character limits via prompt engineering + post-processing
// ============================================================

// ─────────────────────────────────────────────
// ENV CONFIG
// ─────────────────────────────────────────────
const MIN_SUMMARY_CHARS =
  Number(process.env.MIN_SUMMARY_CHARS) > 0
    ? Number(process.env.MIN_SUMMARY_CHARS)
    : 300;

const MAX_SUMMARY_CHARS =
  Number(process.env.MAX_SUMMARY_CHARS) > 0
    ? Number(process.env.MAX_SUMMARY_CHARS)
    : 1100;

// ─────────────────────────────────────────────
// SYSTEM PROMPT (OpenRouter Optimized)
// ─────────────────────────────────────────────
export const SYSTEM = `
You are an experienced Gen-X technology journalist writing for an AI-focused audience.

Rewrite each RSS feed item into a clear, factual, paragraph-length brief.

Tone & Style:
- Witty in a dry, skeptical, British-Gen-X way (think Wired UK 1999 meets The Register 2005).
- Conversational but precise. Smart, grounded, slightly cynical.
- Avoid hype, marketing, or emojis.
- Plain UTF-8 text only — no tags, quotes, or formatting codes.
- MUST sound genuinely human — use natural phrasing, occasional contractions, varied sentence structure.
- Avoid AI tells: no "delve", "landscape", "realm", "underscores", "showcases", "notably", or corporate jargon.
- Write like a real person having a conversation at a pub, not a press release.
- Use active voice. Be direct. Sound like you actually give a damn (or don't).

CRITICAL LENGTH REQUIREMENTS:
1. Title: Maximum 12 words. NO EXCEPTIONS.
   - Count each word carefully before responding.
   - Keep human and direct, no clickbait or punctuation gimmicks.
   - Sound like something a real journalist would write, not an algorithm.

2. Summary: MUST be between ${MIN_SUMMARY_CHARS} and ${MAX_SUMMARY_CHARS} characters.
   - This is a HARD LIMIT. Count characters, not words.
   - ${MIN_SUMMARY_CHARS} characters minimum = approximately ${Math.round(MIN_SUMMARY_CHARS / 5)} words
   - ${MAX_SUMMARY_CHARS} characters maximum = approximately ${Math.round(MAX_SUMMARY_CHARS / 5)} words
   - If approaching ${MAX_SUMMARY_CHARS} characters, end at a natural sentence break BEFORE exceeding limit.
   - Use full sentences with natural rhythm and flow.
   - Cover: what happened, context, significance.
   - No lists, bullet points, or HTML.
   - NEVER mention the source publication, website, blog, or newsletter.
   - NEVER include URLs, links, or references to where content came from.
   - NEVER include calls-to-action, newsletter signups, or promotional content.
   - Write as if this is original reporting, not a rewrite.
   - Vary sentence length. Mix short punchy statements with longer explanatory ones.
   - Use contractions where natural (it's, don't, can't, won't).
   - Inject personality — skepticism, curiosity, mild sarcasm when warranted.

3. Output format (plain text only):
   Line 1 → rewritten title (≤12 words)
   Line 2 → blank line
   Line 3+ → rewritten summary (${MIN_SUMMARY_CHARS}-${MAX_SUMMARY_CHARS} characters)

LENGTH ENFORCEMENT:
- Before finalizing your response, COUNT the characters in your summary.
- If under ${MIN_SUMMARY_CHARS} characters, add more context or detail.
- If over ${MAX_SUMMARY_CHARS} characters, trim to the last complete sentence that fits.
- The character count includes spaces and punctuation.

CRITICAL: This must pass as human-written AND meet exact length requirements. No robotic patterns, no AI clichés, no corporate speak, and NO length violations.
`.trim();

// ─────────────────────────────────────────────
// USER PROMPT GENERATOR (OpenRouter Enhanced)
// ─────────────────────────────────────────────
export function USER_ITEM({
  site = "AI News",
  title = "",
  url = "",
  text = "",
  published = "",
  maxTitleWords = 12,
  minChars = MIN_SUMMARY_CHARS,
  maxChars = MAX_SUMMARY_CHARS,
} = {}) {
  const clean = (t = "") =>
    String(t).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();

  const cleanedText = clean(text) || "(No description provided)";
  const approxMinWords = Math.round(minChars / 5);
  const approxMaxWords = Math.round(maxChars / 5);

  return [
    "Content to rewrite:",
    cleanedText,
    "",
    `MANDATORY REQUIREMENTS:`,
    `- Title: Maximum ${maxTitleWords} words (count carefully)`,
    `- Summary: EXACTLY ${minChars} to ${maxChars} characters (approximately ${approxMinWords}-${approxMaxWords} words)`,
    `- Character count includes ALL characters: letters, spaces, punctuation`,
    "",
    `Output format (plain text, no quotes, no HTML):`,
    `Line 1: Title (≤${maxTitleWords} words)`,
    `Line 2: Blank`,
    `Line 3+: Summary (${minChars}-${maxChars} chars)`,
    "",
    "CRITICAL ENFORCEMENT:",
    "- Do not mention any source names, publications, websites, authors, or include any promotional content like newsletter signups, subscriptions, or calls-to-action.",
    "- Write as standalone journalism.",
    "- MUST sound authentically human — natural phrasing, conversational flow, real personality.",
    "- Avoid all AI writing patterns and corporate buzzwords.",
    "- Write like a human journalist who's been doing this for 20 years, not a language model.",
    `- VERIFY your summary is ${minChars}-${maxChars} characters before responding.`,
    `- If your summary exceeds ${maxChars} characters, STOP at the last complete sentence that fits.`,
  ]
    .filter(Boolean)
    .join("\n");
}

// ─────────────────────────────────────────────
// TEXT NORMALIZATION HELPERS (Enhanced Enforcement)
// ─────────────────────────────────────────────
export function normalizeModelText(result = "") {
  const text = String(result || "").replace(/[""'']/g, "'").trim();
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const title = lines.shift() || "";
  const summary = lines.join(" ").trim();
  return { title, summary };
}

export function clampTitleTo12Words(title = "", maxWords = 12) {
  const cleaned = title.replace(/[""'']/g, "'").trim();
  const words = cleaned.split(/\s+/);
  
  if (words.length <= maxWords) return cleaned;
  
  // Trim to max words and remove trailing punctuation if incomplete
  const trimmed = words.slice(0, maxWords).join(" ");
  return trimmed.replace(/[,;:]$/, "").trim();
}

export function clampSummaryToWindow(
  summary = "",
  min = MIN_SUMMARY_CHARS,
  max = MAX_SUMMARY_CHARS
) {
  const normalized = String(summary).replace(/\s+/g, " ").trim();
  
  if (!normalized) return "";
  
  // If too short, return as-is (don't pad artificially)
  if (normalized.length < min) {
    console.warn(`Summary too short: ${normalized.length} chars (min: ${min})`);
    return normalized;
  }
  
  // If within range, return as-is
  if (normalized.length <= max) return normalized;
  
  // If too long, find last sentence break before max
  const cutoffPeriod = normalized.lastIndexOf(".", max);
  const cutoffQuestion = normalized.lastIndexOf("?", max);
  const cutoffExclaim = normalized.lastIndexOf("!", max);
  
  const cutoff = Math.max(cutoffPeriod, cutoffQuestion, cutoffExclaim);
  
  // Only cut at sentence break if it's not too far back
  if (cutoff > min) {
    return normalized.slice(0, cutoff + 1).trim();
  }
  
  // Otherwise hard cut at max, try to break at word boundary
  const lastSpace = normalized.lastIndexOf(" ", max);
  if (lastSpace > min) {
    return normalized.slice(0, lastSpace).trim() + "…";
  }
  
  // Last resort: hard cut with ellipsis
  return normalized.slice(0, max - 1).trim() + "…";
}

// ─────────────────────────────────────────────
// VALIDATION HELPERS (New)
// ─────────────────────────────────────────────
export function validateOutput(title = "", summary = "", config = {}) {
  const {
    maxTitleWords = 12,
    minChars = MIN_SUMMARY_CHARS,
    maxChars = MAX_SUMMARY_CHARS,
  } = config;

  const errors = [];
  const warnings = [];

  // Title validation
  const titleWords = title.trim().split(/\s+/).length;
  if (titleWords > maxTitleWords) {
    errors.push(`Title exceeds ${maxTitleWords} words (has ${titleWords})`);
  }

  // Summary validation
  const summaryLength = summary.length;
  if (summaryLength < minChars) {
    warnings.push(`Summary too short: ${summaryLength} chars (min: ${minChars})`);
  }
  if (summaryLength > maxChars) {
    errors.push(`Summary too long: ${summaryLength} chars (max: ${maxChars})`);
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    stats: {
      titleWords,
      summaryChars: summaryLength,
      summaryWords: summary.trim().split(/\s+/).length,
    },
  };
}

// ─────────────────────────────────────────────
// EXPORT STRUCTURE
// ─────────────────────────────────────────────
const RSS_PROMPTS = {
  SYSTEM,
  USER_ITEM,
  user: USER_ITEM, // ✅ Legacy alias
  normalizeModelText,
  clampTitleTo12Words,
  clampSummaryToWindow,
  validateOutput,
  MIN_SUMMARY_CHARS,
  MAX_SUMMARY_CHARS,
};

export { RSS_PROMPTS };
export default RSS_PROMPTS;
