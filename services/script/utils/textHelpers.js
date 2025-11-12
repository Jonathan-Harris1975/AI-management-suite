export function cleanTranscript(text) {
  const s = String(text || "");
  return s
    .replace(/\n{3,}/g, "\n\n")
    .replace(/ {2,}/g, " ")
    .replace(/[“”]/g, '"')
    .replace(/[’]/g, "'")
    .trim();
}

export function formatTitle(title) {
  const s = String(title || "");
  return s.replace(/\b\w/g, (char) => char.toUpperCase()).trim();
}

export function normaliseKeywords(raw) {
  const s = String(raw || "");
  const set = new Set(
    s
      .split(",")
      .map((k) => k.trim().toLowerCase())
      .filter(Boolean)
  );
  return Array.from(set).sort();
}

// ────────────────────────────────────────────────
// 🧠 Natural intro + TTS-friendly outro helpers
// ────────────────────────────────────────────────

export function humanizeIntro(text, seed = 0) {
  let out = String(text || "");

  const contractions = [
    [/\bdo not\b/gi, "don't"],
    [/\bcan not\b/gi, "cannot"],
    [/\bwill not\b/gi, "won't"],
    [/\bwe are\b/gi, "we're"],
    [/\bit is\b/gi, "it's"],
    [/\bthat is\b/gi, "that's"],
    [/\bthere is\b/gi, "there's"],
    [/\byou are\b/gi, "you're"],
  ];
  contractions.forEach(([re, rep]) => {
    out = out.replace(re, rep);
  });

  out = out.replace(/\.(\s+[A-Z])/g, (m, p1) =>
    Math.random() < 0.15 ? " —" + p1 : "." + p1
  );

  // Strict-mode safe backreference ($1 not \1)
  out = out.replace(/(\bAI\b[^.!?]{0,60}[.!?])/i, (m) =>
    Math.random() < 0.
