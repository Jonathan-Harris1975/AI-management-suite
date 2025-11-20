// ============================================================
// ⏱️ Duration Calculator (Automatic Episode Length Rotation)
// ============================================================

const baseDurations = {
  introSeconds: 75,
  outroSeconds: 85,
};

function normalizeSessionId(input) {
  if (!input) return "session-unknown";
  if (typeof input === "string") return input;
  if (typeof input === "object") {
    const sid = String(input.sessionId || "");
    const date = String(input.date || "");
    return `${sid}-${date}` || "session-unknown";
  }
  return "session-unknown";
}

function hashCode(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h << 5) - h + str.charCodeAt(i);
  return Math.abs(h);
}

function autoSelectTargetMins(sessionIdNormalized) {
  const seq = [30, 45, 60];
  const h = hashCode(sessionIdNormalized);
  return seq[h % seq.length];
}

export function calculateDuration(section, sessionId, articleCount = 0) {
  const normalized = normalizeSessionId(sessionId);
  const targetMins = autoSelectTargetMins(normalized);
  const h = hashCode(normalized);
  const offset = (h % 61) - 30;

  if (section === "intro") {
    return { introSeconds: Math.max(60, baseDurations.introSeconds + offset), targetMins };
  }
  if (section === "outro") {
    return { outroSeconds: Math.max(60, baseDurations.outroSeconds + offset), targetMins };
  }

  const totalSeconds = targetMins * 60;
  const introSeconds = Math.max(60, baseDurations.introSeconds);
  const outroSeconds = Math.max(60, baseDurations.outroSeconds);
  const baseMain = Math.max(300, totalSeconds - introSeconds - outroSeconds);
  const mainSeconds = Math.max(300, baseMain + offset * 2);

  return { mainSeconds, targetMins };
}

export default { calculateDuration };
