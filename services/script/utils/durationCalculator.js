// ============================================================
// ⏱️ Duration Calculator (Supports 30, 45, 60-minute Episodes)
// ============================================================
//
// Returns section durations (in seconds) based on a target total runtime.
// Also adds small hash-based variation per session for natural pacing.
// ============================================================

/**
 * @param {string} sessionId  - podcast session identifier
 * @param {string} section    - 'intro' | 'main' | 'outro'
 * @param {number} targetMins - total target length in minutes (30,45,60)
 */
export async function calculateDuration(sessionId, section, targetMins = 45) {
  const totalSeconds = targetMins * 60;

  // Section distribution ratios:
  // Intro  = 10%, Main = 75%, Outro = 15%
  const ratios = {
    intro: 0.10,
    main: 0.75,
    outro: 0.15,
  };

  const baseDurations = {
    introSeconds: totalSeconds * ratios.intro,
    mainSeconds: totalSeconds * ratios.main,
    outroSeconds: totalSeconds * ratios.outro,
  };

  // Slight variation per session for realism
  const hash = [...sessionId].reduce((acc, c) => acc + c.charCodeAt(0), 0);
  const offset = (hash % 60) - 30; // ±30 s variation

  switch (section) {
    case "intro":
      return { introSeconds: Math.max(baseDurations.introSeconds + offset, 60) };
    case "main":
      return { mainSeconds: Math.max(baseDurations.mainSeconds + offset * 2, 300) };
    case "outro":
      return { outroSeconds: Math.max(baseDurations.outroSeconds + offset, 60) };
    default:
      return baseDurations;
  }
                                      }
