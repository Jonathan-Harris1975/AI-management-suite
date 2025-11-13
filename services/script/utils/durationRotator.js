import { info } from "#logger.js";

// ============================================================
// 🔄 Duration Rotator (Auto-Normalizing per Episode)
// ============================================================
//
// Ensures total runtime matches the auto-selected 30/45/60 minutes.
// Balances section proportions and returns unified object.
// ============================================================

export function rotateDurations(durations = {}) {
  const targetMins = durations.targetMins || 45;
  const targetSeconds = targetMins * 60;

  const intro = durations.introSeconds || 300;
  const main = durations.mainSeconds || 1800;
  const outro = durations.outroSeconds || 600;

  const sum = intro + main + outro;
  const scale = targetSeconds / sum;

  const finalDurations = {
    introSeconds: Math.round(intro * scale),
    mainSeconds: Math.round(main * scale),
    outroSeconds: Math.round(outro * scale),
    targetMins,
    totalSeconds: Math.round(targetSeconds),
  };

  info(`🕒 Episode runtime auto-set to ${targetMins} min (${targetSeconds}s)`, { targetMins, totalSeconds: finalDurations.totalSeconds });

  return finalDurations;
}
