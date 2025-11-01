// ============================================================
// ⏱️ Duration Calculator (Automatic Episode Length Rotation)
// ============================================================
//
// Each pipeline trigger automatically alternates episode lengths
// between 30, 45, and 60 minutes.
// Adds small hash-based variation for pacing realism.
// ============================================================

/**
 * Automatically selects one of [30,45,60] minutes.
 * Rotation is stable per session/day to avoid duplicate randomness.
 */
function autoSelectTargetMins(sessionId) {
  const sequence = [30, 45, 60];
  const normalized = normalizeSessionId(sessionId);
  const seed = [...normalized].reduce((a, c) => a + c.charCodeAt(0), 0);
  const dayIndex = Math.floor(Date.now() / (1000 * 60 * 60 * 24)); // day-based shift
  const index = (seed + dayIndex) % sequence.length;
  return sequence[index];
}

/**
 * Normalize sessionId safely to ensure it's iterable
 */
function normalizeSessionId(sessionId) {
  if (typeof sessionId === "string") return sessionId;
  if (sessionId && typeof sessionId === "object") {
    return (
      sessionId.sessionId ||
      sessionId.id ||
      JSON.stringify(sessionId)
    );
  }
  if (typeof sessionId === "number") return String(sessionId);
  return "default-session";
}

/**
 * @param {string|object|number} sessionId  - podcast session identifier
 * @param {string} section    - 'intro' | 'main' | 'outro'
 */
export async function calculateDuration(sessionId, section) {
  const normalizedId = normalizeSessionId(sessionId);
  const targetMins = autoSelectTargetMins(normalizedId);
  const totalSeconds = targetMins * 60;

  // Section distribution ratios: Intro=10%, Main=75%, Outro=15%
  const ratios = { intro: 0.10, main: 0.75, outro: 0.15 };

  const baseDurations = {
    introSeconds: totalSeconds * ratios.intro,
    mainSeconds: totalSeconds * ratios.main,
    outroSeconds: totalSeconds * ratios.outro,
  };

  // Small variation for realism
  const hash = [...normalizedId].reduce((acc, c) => acc + c.charCodeAt(0), 0);
  const offset = (hash % 60) - 30; // ±30s variation

  switch (section) {
    case "intro":
      return { introSeconds: Math.max(baseDurations.introSeconds + offset, 60), targetMins };
    case "main":
      return { mainSeconds: Math.max(baseDurations.mainSeconds + offset * 2, 300), targetMins };
    case "outro":
      return { outroSeconds: Math.max(baseDurations.outroSeconds + offset, 60), targetMins };
    default:
      return { ...baseDurations, targetMins };
  }
}
