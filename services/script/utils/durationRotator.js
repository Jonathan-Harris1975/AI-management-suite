// ============================================================
// 🔄 Duration Rotator (Normalizes Long-form Episodes)
// ============================================================
//
// Keeps total runtime equal to chosen target (30,45,60 min)
// and proportionally scales sections for balance.
// ============================================================

export function rotateDurations(durations = {}, targetMins = 45) {
  const targetSeconds = targetMins * 60;
  const intro = durations.introSeconds || 300;
  const main = durations.mainSeconds || 1800;
  const outro = durations.outroSeconds || 600;

  const currentTotal = intro + main + outro;
  const scale = targetSeconds / currentTotal;

  return {
    introSeconds: Math.round(intro * scale),
    mainSeconds: Math.round(main * scale),
    outroSeconds: Math.round(outro * scale),
  };
}
