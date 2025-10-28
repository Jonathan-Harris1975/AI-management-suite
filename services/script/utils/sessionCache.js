// services/script/utils/sessionCache.js

const sessionCache = new Map();

export function storeTempPart(sessionId, part, content) {
  if (!sessionCache.has(sessionId)) sessionCache.set(sessionId, {});
  sessionCache.get(sessionId)[part] = content;
}

export function getAllParts(sessionId) {
  return sessionCache.get(sessionId) || {};
}

export function clearSession(sessionId) {
  sessionCache.delete(sessionId);
}