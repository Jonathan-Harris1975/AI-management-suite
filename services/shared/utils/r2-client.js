// ============================================================
// ☁️ Cloudflare R2 Client — Direct Unsigned Fetch Version
// ============================================================

import { log } from "#logger.js";

// ============================================================
// 🔧 Environment
// ============================================================

const {
  R2_BUCKET_PODCAST,
  R2_BUCKET_RAW,
  R2_BUCKET_RAW_TEXT,
  R2_BUCKET_META,
  R2_BUCKET_MERGED,
  R2_BUCKET_ART,
  R2_BUCKET_RSS_FEEDS,
  R2_BUCKET_PODCAST_RSS_FEEDS,
  R2_BUCKET_TRANSCRIPTS,

  R2_PUBLIC_BASE_URL_PODCAST,
  R2_PUBLIC_BASE_URL_RAW,
  R2_PUBLIC_BASE_URL_RAW_TEXT,
  R2_PUBLIC_BASE_URL_META,
  R2_PUBLIC_BASE_URL_MERGE,
  R2_PUBLIC_BASE_URL_ART,
  R2_PUBLIC_BASE_URL_RSS,
  R2_PUBLIC_BASE_URL_TRANSCRIPT,
} = process.env;

// ============================================================
// 🪣 Bucket Registry
// ============================================================

export const R2_BUCKETS = {
  podcast: R2_BUCKET_PODCAST,
  raw: R2_BUCKET_RAW,
  rawtext: R2_BUCKET_RAW_TEXT,
  meta: R2_BUCKET_META,
  merged: R2_BUCKET_MERGED,
  art: R2_BUCKET_ART,
  podcastart: R2_BUCKET_ART,

  rss: R2_BUCKET_RSS_FEEDS || R2_BUCKET_PODCAST_RSS_FEEDS || "rss-feeds",
  podcastRss: R2_BUCKET_PODCAST_RSS_FEEDS || R2_BUCKET_RSS_FEEDS || "rss-feeds",
  "rss-feeds": R2_BUCKET_RSS_FEEDS || "rss-feeds",

  transcripts: R2_BUCKET_TRANSCRIPTS,
  transcript: R2_BUCKET_TRANSCRIPTS,
};

// ============================================================
// 🌍 Public URL Registry
// ============================================================

export const R2_PUBLIC_URLS = {
  podcast: R2_PUBLIC_BASE_URL_PODCAST,
  raw: R2_PUBLIC_BASE_URL_RAW,
  rawText: R2_PUBLIC_BASE_URL_RAW_TEXT,
  meta: R2_PUBLIC_BASE_URL_META,
  merged: R2_PUBLIC_BASE_URL_MERGE,
  art: R2_PUBLIC_BASE_URL_ART,
  rss: R2_PUBLIC_BASE_URL_RSS,
  transcript: R2_PUBLIC_BASE_URL_TRANSCRIPT,
};

// ============================================================
// 🧩 Helpers
// ============================================================

export function ensureBucketKey(bucketKey) {
  const bucket = R2_BUCKETS[bucketKey];
  if (!bucket) {
    const valid = Object.keys(R2_BUCKETS).join(", ");
    throw new Error(`❌ Unknown R2 bucket key: ${bucketKey} — valid keys: ${valid}`);
  }
  return bucket;
}

export function buildPublicUrl(bucketKey, key) {
  const base = R2_PUBLIC_URLS[bucketKey];
  if (!base) throw new Error(`No public URL configured for bucket key: ${bucketKey}`);
  return `${base.replace(/\/+$/, "")}/${encodeURIComponent(key)}`;
}

// ============================================================
// ⚙️ Core Upload / Download (unsigned fetch)
// ============================================================

export async function uploadBuffer(bucketKey, key, buffer, contentType = "application/octet-stream") {
  const url = buildPublicUrl(bucketKey, key);
  const res = await fetch(url, {
    method: "PUT",
    headers: { "Content-Type": contentType },
    body: buffer,
  });
  if (!res.ok) throw new Error(`R2 upload failed: ${res.status} ${res.statusText}`);
  return url;
}

export async function uploadText(bucketKey, key, text, contentType = "text/plain") {
  return uploadBuffer(bucketKey, key, Buffer.from(text, "utf-8"), contentType);
}

export async function getObjectAsText(bucketKey, key) {
  const url = buildPublicUrl(bucketKey, key);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`R2 get failed: ${res.status} ${res.statusText}`);
  return await res.text();
}

// ============================================================
// 🔁 Aliases (for backward compatibility)
// ============================================================

export const r2Put = uploadBuffer;
export const putJson = async (bucketKey, key, obj) =>
  uploadText(bucketKey, key, JSON.stringify(obj, null, 2), "application/json");
export const putText = uploadText;
export const putObject = uploadBuffer;
export const getObject = getObjectAsText;
export const r2Get = getObjectAsText;

// ============================================================
// 🧩 Delete / List (via public API)
// ============================================================
// These work only if your bucket allows public listing/deletion.

export async function deleteObject(bucketKey, key) {
  const url = buildPublicUrl(bucketKey, key);
  const res = await fetch(url, { method: "DELETE" });
  if (!res.ok) throw new Error(`R2 delete failed: ${res.status} ${res.statusText}`);
  log.info({ bucketKey, key }, "🗑️ Deleted R2 object");
}

export async function listKeys() {
  log.warn("⚠️ listKeys() not available for unsigned public fetch mode.");
  return [];
}

// ============================================================
// 🧩 Startup Log
// ============================================================

log.info(
  { buckets: Object.keys(R2_BUCKETS), urls: Object.values(R2_PUBLIC_URLS) },
  "r2-client.initialized (unsigned fetch mode)"
);

// ============================================================
// 📦 Default Export
// ============================================================

export default {
  uploadBuffer,
  uploadText,
  getObjectAsText,
  deleteObject,
  listKeys,
  buildPublicUrl,
  putJson,
  putText,
  putObject,
  getObject,
  r2Put,
  r2Get,
};
