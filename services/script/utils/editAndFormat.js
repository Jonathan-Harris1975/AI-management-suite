// services/script/utils/editAndFormat.js
// TTS-friendly edit & format

function humanizeText(text) {
  const synonyms = {
    "also": ["also", "as well", "too"],
    "but": ["but", "yet", "however"],
    "so": ["so", "therefore", "thus"],
    "really": ["really", "truly", "genuinely"],
    "very": ["very", "extremely", "particularly"]
  };

  let result = text.replace(/\b(also|but|so|really|very)\b/g, (match) => {
    const options = synonyms[match.toLowerCase()];
    return options[Math.floor(Math.random() * options.length)];
  });

  // Normalise ellipses & spacing (no random punctuation)
  result = result.replace(/\.\.\./g, ".").replace(/\s{2,}/g, " ");
  return result;
}

export default function editAndFormat(text) {
  if (!text || typeof text !== "string") return "";

  let cleaned = text.trim();
  cleaned = cleaned.replace(/\s+/g, " ");
  cleaned = humanizeText(cleaned);

  cleaned = cleaned.replace(/(^\w|\.\s+\w)/g, (match) => match.toUpperCase());

  return cleaned;
}
