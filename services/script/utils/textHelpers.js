// ============================================================
// 🧠 Text Helpers — AI Podcast Suite
// ============================================================

/**
 * Normalise a transcript:
 * - collapse repeated whitespace
 * - normalise quotes
 * - trim outer space
 */
export function cleanTranscript(text) {
  if (!text || typeof text !== "string") return "";

  let out = text.replace(/\r\n/g, "\n");

  // normalise quotes
  out = out
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'");

  // collapse spaces
  out = out.replace(/[ \t]+/g, " ");

  // collapse 3+ newlines to 2
  out = out.replace(/\n{3,}/g, "\n\n");

  return out.trim();
}

/**
 * Extract main content for metadata / LLM passes:
 * - remove line breaks
 * - collapse whitespace
 */
export function extractMainContent(text) {
  if (!text || typeof text !== "string") return "";
  return text
    .replace(/[\r\n]+/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/**
 * Final TTS-friendly cleanup:
 * - replace isolated “AI” with “artificial intelligence”
 * - remove markdown artifacts and bullets
 * - remove obvious stage directions
 */
export function cleanupFinal(text) {
  if (!text || typeof text !== "string") return "";

  let out = cleanTranscript(text);

  // AI → artificial intelligence (word boundaries)
  out = out.replace(/\bAI\b/g, "artificial intelligence");

  // strip markdown bullets / headings
  out = out.replace(/^[\-\*\+]\s+/gm, "");
  out = out.replace(/^#+\s+/gm, "");

  // remove simple stage directions in brackets
  out = out.replace(/\[(music|applause|beat|pause|intro|outro)[^\]]*\]/gi, "");

  // collapse leftover multiple spaces
  out = out.replace(/\s{2,}/g, " ");

  return out.trim();
                    }

