// r2-utils.js (updated minimal logging + root-logger)
import log from "../utils/root-logger.js";
import { listKeys, R2_BUCKETS, buildPublicUrl } from "#shared/r2-client.js";

export async function getTextChunkUrls(sessionId) {
  try {
    const bucketKey = "rawtext";
    const prefix = `${sessionId}/`;
    const keys = await listKeys(bucketKey, prefix);
    return keys.map((k) => buildPublicUrl(bucketKey, k));
  } catch (err) {
    log.error("getTextChunkUrls", { sessionId });
    throw err;
  }
}

export async function listSessionObjects(bucketKey, sessionId) {
  try {
    const keys = await listKeys(bucketKey, `${sessionId}/`);
    return keys;
  } catch (err) {
    log.error("listSessionObjects", { bucketKey, sessionId });
    throw err;
  }
}

export async function deleteSessionObjects(bucketKey, sessionId, deleteFn) {
  try {
    const keys = await listKeys(bucketKey, `${sessionId}/`);
    for (const key of keys) await deleteFn(bucketKey, key);
  } catch (err) {
    log.error("deleteSessionObjects", { bucketKey, sessionId });
    throw err;
  }
}
