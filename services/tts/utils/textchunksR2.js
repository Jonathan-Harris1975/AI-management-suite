import {R2_BUCKETS, listKeys, getObjectAsText, buildPublicUrl} from "#shared/r2-client.js";
import { log } from "#logger.js";

export async function splitTextIntoChunks(sessionId) {
  const prefix = `${sessionId}/`;
  const keys = await listKeys("rawText", prefix);
  const chunkKeys = keys
    .filter(k => /chunk-\d+\.txt$/.test(k))
    .sort((a,b) => {
      const ai = parseInt(a.match(/chunk-(\d+)\.txt$/)[1],10);
      const bi = parseInt(b.match(/chunk-(\d+)\.txt$/)[1],10);
      return ai - bi;
    });
  const urls = chunkKeys.map(k => buildPublicUrl("rawText", k)).filter(Boolean);
  log.info({ sessionId, count: urls.length }, "🧾 text chunk URLs");
  return urls;
}
