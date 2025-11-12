// ============================================================
// 🧠 textHelpers.js — Humanized + Safe for Node v22+
// ============================================================

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

  // Add contractions for a natural voice
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
  contractions.forEach(([re, rep]) => (out = out.replace(re, rep)));

  // Rhythm tweaks — occasional em-dash joins
  out = out.replace(/\.(\s+[A-Z])/g, (m, p1) =>
    Math.random() < 0.15 ? " —" + p1 : "." + p1
  );

  // Add a soft parenthetical aside (strict-mode safe)
  out = out.replace(/(\bAI\b[^.!?]{0,60}[.!?])/i, (m) =>
    Math.random() < 0.35
      ? m.replace(/([.!?])$/, " (as always)$1")
      : m
  );

  // Replace bullet/list markers and redundant openers
  out = out.replace(/^[-•]\s*/gm, "— ");
  out = out.replace(/\bIn this (episode|show)[:,]?\s*/gi, "");

  return out;
}

export function stripUrlProtocols(text) {
  const s = String(text || "");
  return s.replace(/https?:\/\//gi, "");
}

// Adds lexical variation to avoid detector monotony
export function humanizeForDetection(text, seed = 0) {
  let out = String(text || "");

  function prng(n) {
    let x = (n * 9301 + 49297) % 233280;
    return () => (x = (x * 9301 + 49297) % 233280) / 233280;
  }
  const seedNum =
    typeof seed === "number"
      ? seed
      : String(seed)
          .split("")
          .reduce((a, c) => a + c.charCodeAt(0), 0);
  const rnd = prng(seedNum);

  const swaps = [
    [/\bhowever\b/gi, () => (rnd() < 0.5 ? "that said" : "still")],
    [/\bmoreover\b/gi, () => (rnd() < 0.5 ? "plus" : "what's more")],
    [/\btherefore\b/gi, () => (rnd() < 0.5 ? "so" : "as a result")],
    [/\butilize\b/gi, () => "use"],
    [/\bregarding\b/gi, () => (rnd() < 0.5 ? "about" : "re")],
    [/\bdemonstrates\b/gi, () => (rnd() < 0.5 ? "shows" : "illustrates")],
  ];

  swaps.forEach(([re, fn]) => (out = out.replace(re, fn)));

  out = out.replace(/([.!?])\s+(\w)/g, (m, p, c) =>
    rnd() < 0.12 ? `${p}  ${c}` : m
  );

  return out;
}
