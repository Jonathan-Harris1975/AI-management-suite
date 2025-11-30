// ============================================================
// 🧠 Tone Setter — Persona Builder for Episodes
// ============================================================
//
// Provides a dynamic persona description with consistent tone
// across intro, main, and outro for each episode.
// ============================================================

const tones = [
  "Sarcastic",
  "Witty",
  "Dry as hell",
  "Skeptical",
  "Optimistic",
  "Casual",
  "Playful",
  "Bold",
  "Cautious",
  "Confident",
  "Inspirational",
  "Friendly",
  "Humorous",
];

/**
 * Random tone generator (used as fallback)
 */
export function getRandomTone() {
  const idx = Math.floor(Math.random() * tones.length);
  return tones[idx];
}

/**
 * Deterministic tone selector — same session → same tone
 */
export function getToneForSession(sessionId) {
  if (!sessionId) return getRandomTone();
  const hash = [...String(sessionId)].reduce((acc, c) => acc + c.charCodeAt(0), 0);
  return tones[hash % tones.length];
}

/**
 * Build persona text block for an episode
 */
export function applyTone(sessionId) {
  const tone = getToneForSession(sessionId);
  return `You are Jonathan Harris — a British Gen X host of the podcast "Turing’s Torch: AI Weekly".
Your persona is ${tone.toLowerCase()}, intelligent, and conversational.
You never include stage directions, sound cues, or formatting.
Your entire narration must read like natural spoken text only.`;
}
