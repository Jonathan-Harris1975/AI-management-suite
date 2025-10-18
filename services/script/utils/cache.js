import {s3, R2_BUCKETS, uploadBuffer, listKeys, getObjectAsText} from "../../shared/utils/r2-client.js";
// Simple in-memory session cache with TTL
const store = new Map(); // key: sessionId, value: { parts: {...}, expiresAt }

function now() {
  return Date.now();
}

export function setSessionPart(sessionId, key, value, ttlSeconds = 3600) {
  const entry = store.get(sessionId) || { parts: {}, expiresAt: 0 };
  entry.parts[key] = value;
  entry.expiresAt = now() + ttlSeconds * 1000;
  store.set(sessionId, entry);
}

export function getSession(sessionId) {
  const entry = store.get(sessionId);
  if (!entry) return null;
  if (entry.expiresAt < now()) {
    store.delete(sessionId);
    return null;
  }
  return entry.parts;
}

export function clearSession(sessionId) {
  store.delete(sessionId);
  return true;
}
