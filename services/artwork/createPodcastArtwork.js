// services/artwork/createPodcastArtwork.js
// Wrapper for generateArtwork() that saves PNG to R2 and logs output.

import { info, error } from "#shared/logger.js";
import { uploadBuffer } from "#shared/r2-client.js";
import { generateArtwork } from "./utils/artwork.js";
const R2_BUCKET_ART = process.env.R2_BUCKET_ART;

/**
 * Creates podcast artwork, uploads to R2, and returns metadata.
 * @param {object} params
 * @param {string} params.sessionId - Unique podcast session ID
 * @param {string} [params.prompt] - Optional prompt override
 * @returns {Promise<{ ok: boolean, key: string, publicUrl: string }>}
 */
export async function createPodcastArtwork({ sessionId, prompt }) {
  const log = (stage, meta) => info(`artwork.${stage}`, { sessionId, ...meta });

  try {
    log("start", {});

    // 🖌️ Generate base64 PNG
    const theme = prompt || `Podcast artwork for AI Weekly episode ${sessionId}`;
    const base64Data = await generateArtwork(theme);
    const buffer = Buffer.from(base64Data, "base64");

    // 🗂️ Save to R2
    const key = `${sessionId}/cover.png`;
    await uploadBuffer(R2_BUCKET_ART, key, buffer, "image/png");

    const publicUrl = `${process.env.R2_PUBLIC_BASE_URL_ART}/${key}`;
    log("done", { key, publicUrl });

    return { ok: true, key, publicUrl };
  } catch (err) {
    error("fail", { sessionId, error: err.message });
    return { ok: false, error: err.message };
  }
}
