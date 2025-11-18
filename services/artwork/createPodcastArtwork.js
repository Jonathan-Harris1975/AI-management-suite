import logger from "../service-logger.js";
const { info, warn, error, debug } = logger;
// services/artwork/createPodcastArtwork.js
import { uploadBuffer } from "#shared/r2-client.js";
import { generatePodcastArtwork } from "./utils/artwork.js"; // Fixed function name

const R2_BUCKET_ART_KEY = 'art';

export async function createPodcastArtwork({ sessionId, prompt }) {
  const log = (stage, meta) => info(`artwork.${stage}`, { sessionId, ...meta });

  try {
    log("start", {});

    // 🖌️ Generate base64 PNG - fixed function name
    const theme = prompt || `Podcast artwork for AI Weekly episode ${sessionId}`;
    const base64Data = await generatePodcastArtwork(theme); // Fixed function name
    const buffer = Buffer.from(base64Data, "base64");

    // 🗂️ Save to R2
    const key = `${sessionId}.png`;
    const publicUrl = await uploadBuffer(R2_BUCKET_ART_KEY, key, buffer, "image/png");
    log("done", { key, publicUrl });

    return { ok: true, key, publicUrl };
  } catch (err) {
    error("artwork.fail", { sessionId, error: err.message });
    return { ok: false, error: err.message };
  }
}
