// ------------------------------------------------------------
// 🧠 HUMANISER ENGINE
// - Light, safe, TTS-friendly text smoothing
// - Enhances naturalness without rewriting style
// - Replaces "AI" → "artificial intelligence" with context checks
// ------------------------------------------------------------

// Word variation map (mild, avoids changing meaning)
const synonymGroups = {
  "also": ["also", "as well", "too"],
  "but": ["but", "yet", "however"],
  "so": ["so", "therefore", "thus"],
  "really": ["really", "truly", "genuinely"],
  "very": ["very", "extremely", "particularly"],
  "important": ["important", "noteworthy", "significant", "worth noting"],
  "shows": ["shows", "reveals", "demonstrates", "indicates"]
};

// Mild sentence warmers (not too informal)
const softeners = [
  "To be fair,",
  "Interestingly,",
  "One thing worth mentioning is that",
  "That said,",
  "On top of that,"
];

// Context-aware replacement for "AI"
function replaceAI(text) {
  // Replace standalone “AI”, not words containing it.
  return text.replace(/\bAI\b/g, "artificial intelligence");
}

// Add small natural variations
function humanizeText(text) {
  let result = text;

  // Synonym replacement with low probability
  result = result.replace(/\b(also|but|so|really|very|important|shows)\b/gi, (match) => {
    const group = synonymGroups[match.toLowerCase()];
    if (!group) return match;

    // 35% chance of humanising to avoid over-processing
    if (Math.random() > 0.35) return match;

    const replacement = group[Math.floor(Math.random() * group.length)];
    return match[0] === match[0].toUpperCase()
      ? replacement.charAt(0).toUpperCase() + replacement.slice(1)
      : replacement;
  });

  // Lightly inject softeners at paragraph transitions
  result = result.replace(/\. ([A-Z])/g, (m, letter) => {
    if (Math.random() < 0.12) {
      const softener = softeners[Math.floor(Math.random() * softeners.length)];
      return `. ${softener} ${letter}`;
    }
    return `. ${letter}`;
  });

  return result;
}

// Capitalise the start of sentences
function capitaliseSentences(text) {
  return text.replace(/(^\s*\w|[.!?]\s+\w)/g, (m) => m.toUpperCase());
}

// ------------------------------------------------------------
// MAIN FORMATTER
// ------------------------------------------------------------
export default function editAndFormat(text) {
  if (!text || typeof text !== "string") return "";

  let cleaned = text.trim();

  // Normalise spacing but preserve newlines
  cleaned = cleaned.replace(/[ \t]+/g, " ");

  // Remove ellipses but don't flatten meaning
  cleaned = cleaned.replace(/\.{3,}/g, ".");

  // Replace "AI" with "artificial intelligence"
  cleaned = replaceAI(cleaned);

  // Apply soft humanisation effects
  cleaned = humanizeText(cleaned);

  // Capitalise beginning of sentences
  cleaned = capitaliseSentences(cleaned);

  return cleaned;
    }
