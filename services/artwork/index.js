// services/artwork/index.js
// Keeps your existing generation logic intact; only R2 + logging centralization.

import { info, error } from "#shared/logger.js";
import { saveArtworkPng, makeArtworkKey } from "./utils/io.js";

// ⬇️ Import your existing image generation function (unchanged)
import { createImage } from "./create-image.js"; 
// ^^^ keep your current implementation; no OpenRouter/model changes here

/**
 * High-level helper that generates a single PNG and saves it to R2.
 * Returns { url, key }.
 *
 * @param {object} params
 * @param {string} params.prompt - The text prompt for the artwork
 * @param {string} params.series - Series/brand handle (used in key path)
 * @param {string} params.episodeId - Episode id/slug (used in key path)
 * @param {string} [params.name="cover"] - Basename for file
 * @param {object} [params.meta] - Optional metadata to store alongside
 */
export async function generateAndStoreArtwork({
  prompt,
  series,
  episodeId,
  name = "cover",
  meta = {}
}) {
  info("artwork.generate.start", { series, episodeId, name });

  try {
    // 1) Generate PNG bytes (NO changes to your generator)
    const pngBuffer = await createImage({ prompt }); // must return Buffer/Uint8Array (PNG)

    if (!pngBuffer || !pngBuffer.length) {
      throw new Error("createImage returned an empty buffer");
    }

    // 2) Build a tidy key and persist to R2
    const key = makeArtworkKey({ series, episodeId, name, ext: "png" });
    const url = await saveArtworkPng(pngBuffer, key, {
      ...meta,
      prompt,
      series,
      episodeId,
      type: "podcast-cover",
      contentType: "image/png",
    });

    info("artwork.generate.success", { key, url });
    return { url, key };
  } catch (err) {
    error("artwork.generate.fail", { error: err.message });
    throw err;
  }
                                     }
