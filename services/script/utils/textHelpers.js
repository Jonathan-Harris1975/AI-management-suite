// ============================================================
// 🧠 Text Helpers — AI Podcast Suite
// ============================================================
// - Safe preprocessing for transcripts
// - Consistent keyword formatting
// - Normalisation for LLM metadata extraction
// - Provides extractMainContent (required by podcastHelper.js)
// ============================================================

/**
 * Clean transcript content:
 * - remove excessive spacing
 * - normalize curly quotes
 * - trim edges
 */
export function cleanTranscript(text) {
  if (!text || typeof text !== "string") return "";

  return text
    .replace(/\n{3,}/g, "\n\n")     // collapse >2 newlines
    .replace(/ {2,}/g, " ")         // collapse double spaces
    .replace(/[“”]/g, '"')          // normalize double quotes
    .replace(/[’]/g, "'")           // normalize single quotes
    .trim();
}

/**
 * Format an LLM-generated title into clean Title Case
 */
export function formatTitle(title) {
  if (!title || typeof title !== "string") return "";

  return title
    .replace(/\b\w/g, char => char.toUpperCase())
    .trim();
}

/**
 * Deduplicate, normalize, and alphabetize keywords
 */
export function normaliseKeywords(raw) {
  if (!raw || typeof raw !== "string") return [];

  const set = new Set(
    raw
      .split(",")
      .map(k => k.trim().toLowerCase())
      .filter(Boolean)
  );

  return Array.from(set).sort();
}

/**
 * Extract main content for metadata generation:
 * - removes excessive whitespace
 * - collapses line breaks
 * - ensures clean input for LLM prompts
 */
export function extractMainContent(text) {
  if (!text || typeof text !== "string") return "";

  return text
    .replace(/[\r\n]+/g, " ")   // unify and collapse newlines
    .replace(/\s{2,}/g, " ")    // collapse extra spacing
    .trim();
}
