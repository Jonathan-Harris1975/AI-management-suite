// ============================================================
// ⏱️ Duration Calculator
// ============================================================
//
// Returns base durations per section in seconds, optionally
// adjusted by session ID hash for variability.
// ============================================================

export async function calculateDuration(sessionId, section) {
  const base = {
    introSeconds: 60,
    mainSeconds: 180,
    outroSeconds: 60,
  };

  // Optional: vary durations slightly per session for freshness
  const hash = [...sessionId].reduce((acc, c) => acc + c.charCodeAt(0), 0);
  const offset = (hash % 15) - 7; // range -7s to +7s

  switch (section) {
    case "intro":
      return { introSeconds: base.introSeconds + offset };
    case "main":
      return { mainSeconds: base.mainSeconds + offset * 2 };
    case "outro":
      return { outroSeconds: base.outroSeconds + offset };
    default:
      return base;
  }
}
