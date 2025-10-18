import {s3, R2_BUCKETS, uploadBuffer, listKeys, getObjectAsText} from "../../shared/utils/r2-client.js";
// utils/editAndFormat.js

// A small helper to add subtle random bias in word choice / punctuation
function humanizeText(text) {
  const synonyms = {
    "also": ["also", "as well", "too"],
    "but": ["but", "yet", "however"],
    "so": ["so", "therefore", "thus"],
    "really": ["really", "truly", "genuinely"],
    "very": ["very", "extremely", "particularly"]
  };

  // Randomly replace some common words with variations
  let result = text.replace(/\b(also|but|so|really|very)\b/g, (match) => {
    const options = synonyms[match.toLowerCase()];
    return options[Math.floor(Math.random() * options.length)];
  });

  // Randomly add minor punctuation changes for variation
  const punctuationTweaks = [",", " –", "", " ..."];
  result = result.replace(/\./g, () => {
    return "." + (Math.random() < 0.1 ? punctuationTweaks[Math.floor(Math.random() * punctuationTweaks.length)] : "");
  });

  return result;
}

// Main edit & format function
export default function editAndFormat(text) {
  if (!text || typeof text !== "string") return "";

  let cleaned = text.trim();

  // Normalize spacing
  cleaned = cleaned.replace(/\s+/g, " ");

  // Humanize for ZeroGPT resistance
  cleaned = humanizeText(cleaned);

  // Capitalize first letter of sentences
  cleaned = cleaned.replace(/(^\w|\.\s+\w)/g, (match) => match.toUpperCase());

  return cleaned;
}
