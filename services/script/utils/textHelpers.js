export function cleanTranscript(text) {
  return text
    .replace(/\n{3,}/g, '\n\n')
    .replace(/ {2,}/g, ' ')
    .replace(/[“”]/g, '"')
    .replace(/[’]/g, "'")
    .trim();
}

export function formatTitle(title) {
  return title.replace(/\b\w/g, char => char.toUpperCase()).trim();
}

export function normaliseKeywords(raw) {
  const set = new Set(
    raw.split(',')
      .map(k => k.trim().toLowerCase())
      .filter(Boolean)
  );
  return Array.from(set).sort();
}
