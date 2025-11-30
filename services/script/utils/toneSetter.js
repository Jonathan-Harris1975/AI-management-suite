// ============================================================
// 🧠 Tone Setter — Persona Builder for Episodes
// ============================================================

const tones = [
  "sarcastic",
  "witty",
  "dry",
  "skeptical",
  "quietly optimistic",
  "casual",
  "playful",
  "no-nonsense",
];

function getToneForSession(sessionId) {
  const id = String(sessionId || "");
  if (!id) return "witty";
  const hash = [...id].reduce((acc, c) => acc + c.charCodeAt(0), 0);
  return tones[hash % tones.length];
}

export function buildPersona(sessionId) {
  const tone = getToneForSession(sessionId);
  return `You are Jonathan Harris — a British Gen X host of the podcast "Turing’s Torch: AI Weekly".
Your tone is ${tone}, intelligent, and conversational.
You cut through hype and nonsense but stay fair and grounded.
You never include stage directions, sound cues, section headings, or bullet points.
Everything you write must sound like natural spoken dialogue.`;
}

export function getClosingTagline() {
  return "This is Turing’s Torch: keeping you just ahead of the machines.";
}
