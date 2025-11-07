// ============================================================
// ☁️ Cloudflare R2 Client — Hybrid Authenticated Write + Public Read (Final Fixed)
// ============================================================

import { S3Client, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { log } from "#logger.js";

// ============================================================
// 🔧 Environment
// ============================================================

const {
  // Auth credentials + endpoint
  R2_ACCESS_KEY_ID,
  R2_SECRET_ACCESS_KEY,
  R2_ENDPOINT,
  R2_REGION,

  // Buckets
  R2_BUCKET_PODCAST,
  R2_BUCKET_RAW,
  R2_BUCKET_RAW_TEXT,
  R2_BUCKET_META,
  R2_BUCKET_MERGED,
  R2_BUCKET_ART,
  R2_BUCKET_RSS_FEEDS,
  R2_BUCKET_PODCAST_RSS_FEEDS,
  R2_BUCKET_TRANSCRIPTS,

  // Public URLs
  R2_PUBLIC_BASE_URL_PODCAST,
  R2_PUBLIC_BASE_URL_RAW,
  R2_PUBLIC_BASE_URL_RAW_TEXT,
  R2_PUBLIC_BASE_URL_META,
  R2_PUBLIC_BASE_URL_MERGE,
  R2_PUBLIC_BASE_URL_ART,
  R2_PUBLIC_BASE_URL_RSS,
  R2_PUBLIC_BASE_URL_TRANSCRIPT,
  R2_PUBLIC_BASE_URL_TRANSCRIPTS, // optional fallback for plural
} = process.env;

// ============================================================
// 🧠 Authenticated S3 Client (for PUT / DELETE)
// ============================================================

export const s3 = new S3Client({
  region: R2_REGION || "auto",
  endpoint: R2_ENDPOINT,
  credentials: {
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
  },
});

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
  rssfeeds: R2_BUCKET_RSS_FEEDS ,
  transcripts: R2_BUCKET_TRANSCRIPTS,
  transcript: R2_BUCKET_TRANSCRIPTS,
};

// ============================================================
// 🌍 Public URL Registry (with plural/singular alias fix)
// ============================================================

export const R2_PUBLIC_URLS = {
  podcast: R2_PUBLIC_BASE_URL_PODCAST,
  raw: R2_PUBLIC_BASE_URL_RAW,
  rawtext: R2_PUBLIC_BASE_URL_RAW_TEXT,
  meta: R2_PUBLIC_BASE_URL_META,
  merged: R2_PUBLIC_BASE_URL_MERGE,
  art: R2_PUBLIC_BASE_URL_ART,
  rss: R2_PUBLIC_BASE_URL_RSS,
  transcript: R2_PUBLIC_BASE_URL_TRANSCRIPT,
  transcripts: R2_PUBLIC_BASE_URL_TRANSCRIPTS || R2_PUBLIC_BASE_URL_TRANSCRIPT, // ✅ fixed alias
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
  if (!base)
    throw new Error(`No public URL configured for bucket key: ${bucketKey}`);
  return `${base.replace(/\/+$/, "")}/${encodeURIComponent(key)}`;
}

// ============================================================
// ⚙️ Core Upload / Download
// ============================================================

// 🔒 Authenticated write (S3Client)
export async function uploadBuffer(bucketKey, key, buffer, contentType = "application/octet-stream") {
  const bucket = ensureBucketKey(bucketKey);
  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: buffer,
      ContentType: contentType,
    })
  );
  const url = buildPublicUrl(bucketKey, key);
  log.info({ bucketKey, key, url }, "💾 Uploaded to R2 via S3 endpoint");
  return url;
}

export async function uploadText(bucketKey, key, text, contentType = "text/plain") {
  return uploadBuffer(bucketKey, key, Buffer.from(text, "utf-8"), contentType);
}

// 🌐 Unsigned public read (fetch)
export async function getObjectAsText(bucketKey, key) {
  const url = buildPublicUrl(bucketKey, key);
  const res = await fetch(url);
  if (!res.ok)
    throw new Error(`R2 get failed (${bucketKey}/${key}): ${res.status} ${res.statusText}`);
  const text = await res.text();
  log.info({ bucketKey, key, bytes: text.length }, "📥 R2 object read (public)");
  return text;
}

// ============================================================
// 🔁 Aliases (backward compatibility)
// ============================================================

export const r2Put = uploadBuffer;
export const putJson = async (bucketKey, key, obj) =>
  uploadText(bucketKey, key, JSON.stringify(obj, null, 2), "application/json");
export const putText = uploadText;
export const putObject = uploadBuffer;
export const getObject = getObjectAsText;
export const r2Get = getObjectAsText;

// ============================================================
// 🧩 Delete / List
// ============================================================

export async function deleteObject(bucketKey, key) {
  const bucket = ensureBucketKey(bucketKey);
  await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
  log.info({ bucketKey, key }, "🗑️ R2 object deleted via S3");
}

export async function listKeys() {
  log.warn("⚠️ listKeys() not available in hybrid mode (S3 write + public read).");
  return [];
}

// ============================================================
// 🧩 Startup Log
// ============================================================

log.info(
  {
    mode: "hybrid",
    endpoint: R2_ENDPOINT,
    buckets: Object.keys(R2_BUCKETS),
    publicURLs: Object.entries(R2_PUBLIC_URLS).filter(([_, v]) => !!v),
  },
  "r2-client.initialized"
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
