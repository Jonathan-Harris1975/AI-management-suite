// ====================================================================
// editAndFormat.js – Full Production Version
// ====================================================================
// - TTS-friendly normalisation
// - Replaces “AI” → “artificial intelligence”
// - Splits long sentences (>22 words)
// - Light humanisation layer
// ====================================================================

function splitLongSentences(text) {
  const sentences = text.split(/(?<=[.!?])\s+/);
  const processed = sentences.map(s => {
    const wordCount = s.trim().split(/\s+/).length;
    if (wordCount <= 22) return s;

    // Split long sentences into natural chunks
    return s.replace(/(.{1,160})(\s|$)/g, "$1. ").trim();
  });

  return processed.join(" ");
}

// Light humaniser (subtle word variation, not stylistic rewrite)
function humanise(text) {
  const variations = {
    "however": ["however", "mind you", "that said"],
    "but": ["but", "yet", "still"],
    "so": ["so", "therefore", "as a result"],
    "really": ["really", "truly", "genuinely"]
  };

  return text.replace(/\b(however|but|so|really)\b/gi, match => {
    const opts = variations[match.toLowerCase()];
    if (!opts) return match;
    if (Math.random() > 0.35) return match; // low probability
    const choice = opts[Math.floor(Math.random() * opts.length)];
    return match[0] === match[0].toUpperCase()
      ? choice.charAt(0).toUpperCase() + choice.slice(1)
      : choice;
  });
}

export default function editAndFormat(text) {
  if (!text || typeof text !== "string") return "";

  let out = text.trim();

  // Normalise spacing
  out = out.replace(/[ \t]+/g, " ");

  // Replace AI → artificial intelligence
  out = out.replace(/\bAI\b/g, "artificial intelligence");

  // Remove ellipses
  out = out.replace(/\.{3,}/g, ".");

  // Split long sentences
  out = splitLongSentences(out);

  // Apply light humanisation
  out = humanise(out);

  return out;
}
