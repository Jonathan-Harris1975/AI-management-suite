// services/artwork/utils/io.js
// Centralized I/O helpers for artwork service (PNG uploads + metadata)

import { putObject, putJson } from "#shared/r2-client.js";
import { info, error } from "#shared/logger.js";

const ART_BUCKET  = process.env.R2_BUCKET_ART;     // e.g. "podcastart"
const META_BUCKET = process.env.R2_BUCKET_META;    // optional, e.g. "podcast-meta"
const ART_PUBLIC  = process.env.R2_PUBLIC_BASE_URL_ART; // e.g. "https://podcast-coverart.example.com"

function requireEnv(name, val) {
  if (!val) {
    throw new Error(`Missing required env: ${name}`);
  }
  return val;
}

/**
 * Save a PNG buffer to R2 (ART bucket) and optional metadata to META bucket.
 * Returns the public URL to the saved PNG.
 *
 * @param {Buffer|Uint8Array} pngBuffer - Raw PNG bytes
 * @param {string} key - Object key to write, e.g. "episodes/ep-001/cover.png"
 * @param {object} [meta] - Optional metadata object to persist alongside the image
 */
export async function saveArtworkPng(pngBuffer, key, meta = null) {
  requireEnv("R2_BUCKET_ART", ART_BUCKET);
  requireEnv("R2_PUBLIC_BASE_URL_ART", ART_PUBLIC);

  if (!pngBuffer || !key) {
    throw new Error("saveArtworkPng requires both pngBuffer and key");
  }

  // Write PNG
  await putObject(ART_BUCKET, key, pngBuffer, "image/png");
  info("artwork.r2.put", { bucket: ART_BUCKET, key, bytes: pngBuffer.length });

  // Optional metadata
  if (meta && META_BUCKET) {
    const metaKey = key.replace(/\.png$/i, ".json");
    await putJson(META_BUCKET, metaKey, meta);
    info("artwork.r2.meta.put", { bucket: META_BUCKET, key: metaKey });
  }

  // Public URL (guaranteed stable + cacheable via your CDN/R2 custom domain)
  const publicUrl = `${ART_PUBLIC.replace(/\/+$/, "")}/${key.replace(/^\/+/, "")}`;
  info("artwork.public.url", { url: publicUrl });

  return publicUrl;
}

/**
 * Utility helper for generating a sane key, e.g.:
 *   makeArtworkKey({ series: "ai-daily", episodeId: "ep-042", ext: "png" })
 *   => "ai-daily/ep-042/cover.png"
 */
export function makeArtworkKey({ series = "default", episodeId = "untitled", name = "cover", ext = "png" } = {}) {
  const safe = (s) => String(s || "").trim().toLowerCase().replace(/[^a-z0-9\-_/]+/g, "-");
  return `${safe(series)}/${safe(episodeId)}/${safe(name)}.${ext}`;
}
