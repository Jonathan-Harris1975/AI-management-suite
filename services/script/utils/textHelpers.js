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

// Adds mild human-like variation (contractions, rhythm, aside dashes/parentheses)
export function humanizeIntro(text, seed = 0) {
  if (!text) return text;
  let out = text;

  // Prefer contractions
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
  contractions.forEach(([re, rep]) => { out = out.replace(re, rep); });

  // Light rhythm tweaks: merge overly short sentences; add an em-dash sparingly
  out = out.replace(/\.(\s+[A-Z])/g, (m, p1) => Math.random() < 0.15 ? " —"+p1 : "."+p1);

  // Parenthetical aside every so often
  out = out.replace(/(\bAI\b[^.!?]{0,60}[.!?])/i, (m) => Math.random() < 0.35 ? m.replace(/([.!?])$/, " (as always)\1") : m);

  // Reduce robotic list markers
  out = out.replace(/^[-•]\s*/gm, "— ");

  // Collapse repeated phrasing like "In this episode" lead-ins
  out = out.replace(/\bIn this (episode|show)[:,]?\s*/gi, "");

  return out;
}

// Remove protocols for better TTS: https:// and http://
// (keeps domains and paths intact)
export function stripUrlProtocols(text) {
  if (!text) return text;
  return text.replace(/https?:\/\//gi, "");
}

// Small lexical shuffle to lower LLM-detector signals without changing meaning
export function humanizeForDetection(text, seed = 0) {
  if (!text) return text;

  // Deterministic pseudo-random based on seed
  function prng(n){ let x = (n*9301+49297)%233280; return ()=> (x = (x*9301+49297)%233280)/233280; }
  const rnd = prng(typeof seed === "number" ? seed : (String(seed).split("").reduce((a,c)=>a+c.charCodeAt(0),0)));

  const swaps = [
    [/\bhowever\b/gi, () => rnd()<0.5 ? "that said" : "still"],
    [/\bmoreover\b/gi, () => rnd()<0.5 ? "plus" : "what's more"],
    [/\btherefore\b/gi, () => rnd()<0.5 ? "so" : "as a result"],
    [/\butilize\b/gi, () => "use"],
    [/\bregarding\b/gi, () => rnd()<0.5 ? "about" : "re"],
    [/\bdemonstrates\b/gi, () => rnd()<0.5 ? "shows" : "illustrates"],
  ];

  let out = text;
  swaps.forEach(([re, fn]) => { out = out.replace(re, fn); });

  // Sentence-length variability: join or split occasionally
  out = out.replace(/([.!?])\s+(\w)/g, (m, p, c) => rnd()<0.12 ? `${p}  ${c}` : m);
  return out;
}
