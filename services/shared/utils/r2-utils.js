// r2-utils.js — helper around r2-client with minimal logging
import log from "../../../utils/root-logger.js";
import { listKeys, buildPublicUrl } from "#shared/r2-client.js";

export async function getTextChunkUrls(sessionId) {
  try {
    const keys = await listKeys("rawtext", `${sessionId}/`);
    return keys.map((k) => buildPublicUrl("rawtext", k));
  } catch (err) {
    log.error("r2.textChunks.error", { sessionId });
    throw err;
  }
}

export async function listSessionObjects(bucketKey, sessionId) {
  try {
    return await listKeys(bucketKey, `${sessionId}/`);
  } catch (err) {
    log.error("r2.sessionList.error", { bucketKey, sessionId });
    throw err;
  }
}

export async function deleteSessionObjects(bucketKey, sessionId, deleteFn) {
  try {
    const keys = await listKeys(bucketKey, `${sessionId}/`);
    for (const key of keys) {
      await deleteFn(bucketKey, key);
    }
  } catch (err) {
    log.error("r2.sessionDelete.error", { bucketKey, sessionId });
    throw err;
  }
}
