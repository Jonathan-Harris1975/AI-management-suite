import { info, error } from "#logger.js";
import { uploadText, getObjectAsText, listKeys } from "#shared/r2-client.js";
import chunkText from "../../script/utils/chunkText.js";

/**
 * Retrieve ordered text chunk URLs for TTS synthesis.
 * Falls back to transcript if chunk files are missing.
 */
export async function getTextChunkUrls(sessionId) {
  const prefix = `${sessionId}/`;
  // Try listing existing chunk files first
  let keys = await listKeys("rawtext", prefix);
  keys = (keys || [])
    .filter(k => /chunk-\d+\.txt$/.test(k))
    .sort((a, b) => {
      const ai = parseInt(a.match(/chunk-(\d+)\.txt$/)[1], 10);
      const bi = parseInt(b.match(/chunk-(\d+)\.txt$/)[1], 10);
      return ai - bi;
    });

  // Fallback to transcript if no chunks exist
  if (!keys.length) {
    const fullKey = `${sessionId}.txt`;
    let full = "";
    try {
      full = await getObjectAsText("rawtext", fullKey);
    } catch {}
    if (!full || !full.trim().length) {
      try {
        full = await getObjectAsText("transcripts", fullKey);
      } catch {}
    }

    if (full && full.trim().length) {
      const parts = chunkText(full);
      for (let i = 0; i < parts.length; i++) {
        await uploadText("rawtext", `${sessionId}/chunk-${i + 1}.txt`, parts[i], "text/plain");
      }
      keys = parts.map((_, i) => `${sessionId}/chunk-${i + 1}.txt`);
      info({ sessionId, produced: parts.length }, "🧩 Generated chunk files from transcript fallback");
    }
  }

  if (!keys.length) {
    error({ sessionId }, `❌ No text chunks found in rawtext for ${sessionId}`);
    return [];
  }

  const baseUrl = (process.env.R2_PUBLIC_BASE_URL_RAW_TEXT || "").replace(/\/$/, "");
  const urls = keys.map(k => `${baseUrl}/${k}`);
  info({ sessionId, count: urls.leng isth }, "🧾 text chunk URLs");
  return urls;
}
