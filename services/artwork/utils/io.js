// services/artwork/utils/io.js (patched)
import { putObject, putJson } from "#shared/r2-client.js";
import { info, error } from "#logger.js";

const ART_BUCKET  = process.env.R2_BUCKET_ART;
const META_BUCKET = process.env.R2_BUCKET_META;
const ART_PUBLIC  = process.env.R2_PUBLIC_BASE_URL_ART;

function requireEnv(name, val) {
  if (!val) throw new Error(`Missing required env: ${name}`);
  return val;
}

export async function saveArtworkPng(pngBuffer, key, meta = null) {
  const bucket = requireEnv("R2_BUCKET_ART", ART_BUCKET);
  const publicBase = requireEnv("R2_PUBLIC_BASE_URL_ART", ART_PUBLIC);

  if (!pngBuffer || !key) throw new Error("saveArtworkPng requires both pngBuffer and key");

  try {
    await putObject(bucket, key, pngBuffer, "image/png");
    info("artwork.r2.put", { bucket, key, bytes: pngBuffer.length });

    if (meta && META_BUCKET) {
      const metaKey = key.replace(/\.png$/i, ".json");
      await putJson(META_BUCKET, metaKey, meta);
      info("artwork.r2.meta.put", { bucket: META_BUCKET, key: metaKey });
    }

    return `${publicBase.replace(/\/+$/, "")}/${key.replace(/^\/+/, "")}`;
  } catch (err) {
    error("artwork.r2.upload.fail", { message: err.message, bucket, key });
    throw err;
  }
}
