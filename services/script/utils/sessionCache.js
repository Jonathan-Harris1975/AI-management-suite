// services/script/utils/sessionCache.js
// Simple in-memory cache for script sections and ephemeral data (e.g., artworkPrompt)

const store = new Map(); // sessionId -> { intro, main, outro, artworkPrompt, ... }

function keyFrom(sessionIdLike) {
  if (!sessionIdLike) return "unknown";
  if (typeof sessionIdLike === "object") return sessionIdLike.sessionId || "unknown";
  return String(sessionIdLike);
}

export async function storeTempPart(sessionIdLike, partKey, content) {
  const key = keyFrom(sessionIdLike);
  if (!store.has(key)) store.set(key, {});
  store.get(key)[partKey] = content;
  return true;
}

export async function getTempPart(sessionIdLike, partKey) {
  const key = keyFrom(sessionIdLike);
  const parts = store.get(key) || {};
  return parts[partKey] || "";
}

export async function getAllTempParts(sessionIdLike) {
  const key = keyFrom(sessionIdLike);
  return store.get(key) || {};
}

export async function clearTempParts(sessionIdLike) {
  const key = keyFrom(sessionIdLike);
  store.delete(key);
  return true;
}

export default { storeTempPart, getTempPart, getAllTempParts, clearTempParts };
