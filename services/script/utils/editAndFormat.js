// ====================================================================
// editAndFormat.js – HUMAN-OPTIMISED PRODUCTION VERSION
// ====================================================================
// Includes:
//  • TTS-friendly normalisation
//  • Replaces "AI" → "artificial intelligence"
//  • Splits long sentences into natural rhythm
//  • Humanisation layer (spoken English tone)
//  • Removes fluff, repeated words, filler phrases
//  • Smoothing transitions + pacing improvements
// ====================================================================

// ------------------------------------------------------------
// Helper: Split overly long sentences
// ------------------------------------------------------------
function splitLongSentences(text) {
  const sentences = text.split(/(?<=[.!?])\s+/);

  const processed = sentences.map((s) => {
    const wordCount = s.trim().split(/\s+/).length;
    if (wordCount <= 25) return s.trim();

    // Chunk into TTS-friendly bites ~150 chars each
    return s.replace(/(.{1,150})(\s|$)/g, "$1. ").trim();
  });

  return processed.join(" ");
}

// ------------------------------------------------------------
// Humanise: soften robotic phrasing & add natural tone
// ------------------------------------------------------------
function humanise(text) {
  const substitutions = [
    { find: /\bhowever\b/gi, options: ["however", "mind you", "that said"] },
    { find: /\bbut\b/gi, options: ["but", "yet", "still"] },
    { find: /\bso\b/gi, options: ["so", "therefore", "as a result"] },
    { find: /\breally\b/gi, options: ["really", "truly", "genuinely"] },
    { find: /\bfor example\b/gi, options: ["for example", "take this as an example"] },
    { find: /\bbecause\b/gi, options: ["because", "since", "as"] },
    { find: /\bin addition\b/gi, options: ["in addition", "also worth noting"] },
  ];

  let out = text;

  substitutions.forEach(({ find, options }) => {
    out = out.replace(find, (match) => {
      if (Math.random() > 0.33) return match; // keep stable most of the time
      const choice = options[Math.floor(Math.random() * options.length)];
      return match[0] === match[0].toUpperCase()
        ? choice.charAt(0).toUpperCase() + choice.slice(1)
        : choice;
    });
  });

  return out;
}

// ------------------------------------------------------------
// Cleanup filler language (common LLM artefacts)
// ------------------------------------------------------------
function removeFiller(text) {
  return text
    .replace(/\bIn conclusion[, ]*/gi, "") // avoid robotic endings
    .replace(/\bTo summarise[, ]*/gi, "")
    .replace(/\bLet’s dive in\b/gi, "")
    .replace(/\bLet's dive in\b/gi, "")
    .replace(/\bIt’s important to note that\b/gi, "")
    .replace(/\bNeedless to say\b/gi, "")
    .replace(/\bIn today’s world\b/gi, "");
}

// ------------------------------------------------------------
// Smooth transitions between paragraphs
// ------------------------------------------------------------
function smoothTransitions(text) {
  return text
    .replace(/(\.\s+)(However|But|Yet)/g, "$1$2")
    .replace(/(\w)\s+(\w)/g, "$1 $2");
}

// ------------------------------------------------------------
// Main format function
// ------------------------------------------------------------
export default function editAndFormat(text) {
  if (!text || typeof text !== "string") return "";

  let out = text.trim();

  // 1. Remove weird spacing + double spaces
  out = out.replace(/[ \t]+/g, " ");
  out = out.replace(/\n{3,}/g, "\n\n");

  // 2. Replace AI with full wording
  out = out.replace(/\bAI\b/gi, "artificial intelligence");

  // 3. Remove ellipses
  out = out.replace(/\.{3,}/g, ".");

  // 4. Remove filler/robotic intros
  out = removeFiller(out);

  // 5. Split long sentences
  out = splitLongSentences(out);

  // 6. Light humanisation
  out = humanise(out);

  // 7. Smooth transitions
  out = smoothTransitions(out);

  // 8. Final tidy-up
  out = out
    .replace(/\s{2,}/g, " ")
    .replace(/\n\s+\n/g, "\n\n")
    .trim();

  return out;
    }
