// services/artwork/createPodcastArtwork.js
import { info, error, debug } from "#logger.js";
import { uploadBuffer } from "#shared/r2-client.js";
import { generatePodcastArtwork } from "./utils/artwork.js";

const R2_BUCKET_ART_KEY = "art";

export async function createPodcastArtwork(input) {
  // Support both createPodcastArtwork("TT-2025-11-28")
  // and createPodcastArtwork({ sessionId: "TT-2025-11-28", prompt })
  const sessionId = typeof input === "string" ? input : input?.sessionId;
  const prompt = typeof input === "object" ? input?.prompt : undefined;

  const log = (stage, meta) =>
    info(`artwork.${stage}`, { sessionId, ...meta });

  try {
    debug("start", {});

    const theme =
      prompt || `Podcast artwork for AI Weekly episode ${sessionId}`;

    // Generate base64 PNG from OpenRouter
    const base64Data = await generatePodcastArtwork(theme);
    const buffer = Buffer.from(base64Data, "base64");

    // Save to R2 with the correct filename
    const key = `${sessionId}.png`;
    const publicUrl = await uploadBuffer(
      R2_BUCKET_ART_KEY,
      key,
      buffer,
      "image/png"
    );

    debug("done", { key, publicUrl });

    return { ok: true, key, publicUrl };
  } catch (err) {
    error("artwork.fail", { sessionId, error: err.message });
    return { ok: false, error: err.message };
  }
}
