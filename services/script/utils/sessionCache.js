// ============================================================
// 🧠 Simple in-memory session cache for orchestration parts
// ============================================================

const tempStore = new Map(); // sessionId -> { intro, main, outro, ... }

export async function storeTempPart(sessionId, partKey, content) {
  if (!sessionId) throw new Error("Missing sessionId");
  const key = typeof sessionId === "object" ? sessionId.sessionId : sessionId;
  if (!tempStore.has(key)) tempStore.set(key, {});
  tempStore.get(key)[partKey] = content;
}

export async function getTempPart(sessionId, partKey) {
  const key = typeof sessionId === "object" ? sessionId.sessionId : sessionId;
  const parts = tempStore.get(key);
  return parts ? parts[partKey] || "" : "";
}

export async function getAllTempParts(sessionId) {
  const key = typeof sessionId === "object" ? sessionId.sessionId : sessionId;
  return tempStore.get(key) || {};
}

export async function clearTempParts(sessionId) {
  const key = typeof sessionId === "object" ? sessionId.sessionId : sessionId;
  tempStore.delete(key);
}

export default { storeTempPart, getTempPart, getAllTempParts, clearTempParts };
