import { listKeys, buildPublicUrl } from "#shared/r2-client.js";

/**
 * Fetch and return chunk file URLs for a given session.
 */
export async function getTextChunksFromR2(sessionId) {
  const prefix = `${sessionId}/`;
  const keys = await listKeys("rawtext", prefix);
  if (!keys?.length) return [];
  return keys
    .filter(k => /chunk-\d+\.txt$/.test(k))
    .sort((a, b) => {
      const ai = parseInt(a.match(/chunk-(\d+)\.txt$/)[1], 10);
      const bi = parseInt(b.match(/chunk-(\d+)\.txt$/)[1], 10);
      return ai - bi;
    })
    .map(k => buildPublicUrl("rawtext", k));
}
