// services/shared/utils/r2-client.js
// ============================================================
// ☁️ Cloudflare R2 Client — Final Unified + Backward Compatible Version
// ============================================================
//
// ✅ Compatible with ALL services (script-maker, tts, rss, podcast)
// ✅ Supports: chunks, merged, raw, rss-feeds, transcripts
// ✅ Restores buildPublicUrl() for legacy modules
// ✅ Safe for both public URL generation & upload/download ops
// ============================================================

import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { log } from "#logger.js";

// ------------------------------------------------------------
// 🔧 Environment Variables
// ------------------------------------------------------------
const {
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
  R2_BUCKET_CHUNKS, // ✅ for TTS

  // Public URLs
  R2_PUBLIC_BASE_URL_PODCAST,
  R2_PUBLIC_BASE_URL_RAW,
  R2_PUBLIC_BASE_URL_RAW_TEXT,
  R2_PUBLIC_BASE_URL_META,
  R2_PUBLIC_BASE_URL_MERGE,
  R2_PUBLIC_BASE_URL_ART,
  R2_PUBLIC_BASE_URL_RSS,
  R2_PUBLIC_BASE_URL_TRANSCRIPT,
  R2_PUBLIC_BASE_URL_CHUNKS, // ✅ for TTS chunks
} = process.env;

// ------------------------------------------------------------
// 🧠 Initialize S3-compatible client
// ------------------------------------------------------------
export const s3 = new S3Client({
  region: R2_REGION || "auto",
  endpoint: R2_ENDPOINT,
  credentials: {
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
  },
});

// ------------------------------------------------------------
// 🪣 Bucket Aliases (Full Coverage)
// ------------------------------------------------------------
export const R2_BUCKETS = {
  podcast: R2_BUCKET_PODCAST,
  raw: R2_BUCKET_RAW,
  rawtext: R2_BUCKET_RAW_TEXT,
  rawText: R2_BUCKET_RAW_TEXT,
  meta: R2_BUCKET_META,
  merged: R2_BUCKET_MERGED,
  art: R2_BUCKET_ART,

  // ✅ Chunks support
  chunks: R2_BUCKET_CHUNKS || "podcast-chunks",
  "podcast-chunks": R2_BUCKET_CHUNKS || "podcast-chunks",

  // ✅ RSS feeds
  rss: R2_BUCKET_RSS_FEEDS || R2_BUCKET_PODCAST_RSS_FEEDS || "rss-feeds",
  "rss-feeds": R2_BUCKET_RSS_FEEDS || "rss-feeds",
  podcastRss: R2_BUCKET_PODCAST_RSS_FEEDS || R2_BUCKET_RSS_FEEDS || "rss-feeds",
  rssfeeds: R2_BUCKET_RSS_FEEDS || "rss-feeds",

  // ✅ Transcripts
  transcripts: R2_BUCKET_TRANSCRIPTS,
  transcript: R2_BUCKET_TRANSCRIPTS,
};

// ------------------------------------------------------------
// 🌍 Public URL Aliases
// ------------------------------------------------------------
export const R2_PUBLIC_URLS = {
  podcast: R2_PUBLIC_BASE_URL_PODCAST,
  raw: R2_PUBLIC_BASE_URL_RAW,
  rawtext: R2_PUBLIC_BASE_URL_RAW_TEXT,
  rawText: R2_PUBLIC_BASE_URL_RAW_TEXT,
  meta: R2_PUBLIC_BASE_URL_META,
  merged: R2_PUBLIC_BASE_URL_MERGE,
  art: R2_PUBLIC_BASE_URL_ART,
  rss: R2_PUBLIC_BASE_URL_RSS,
  transcript: R2_PUBLIC_BASE_URL_TRANSCRIPT,

  // ✅ Chunks URLs
  chunks: R2_PUBLIC_BASE_URL_CHUNKS,
  "podcast-chunks": R2_PUBLIC_BASE_URL_CHUNKS,
};

// ------------------------------------------------------------
// 🧩 Validation
// ------------------------------------------------------------
export function ensureBucketKey(bucketKey) {
  const bucket = R2_BUCKETS[bucketKey];
  if (!bucket) {
    const valid = Object.keys(R2_BUCKETS).join(", ");
    throw new Error(`❌ Unknown R2 bucket key: ${bucketKey} — valid keys: ${valid}`);
  }
  return bucket;
}

// ------------------------------------------------------------
// ⚙️ Upload & Retrieval Helpers
// ------------------------------------------------------------
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
  return `${R2_PUBLIC_URLS[bucketKey]}/${encodeURIComponent(key)}`;
}

export async function uploadText(bucketKey, key, text, contentType = "text/plain") {
  return uploadBuffer(bucketKey, key, Buffer.from(text, "utf-8"), contentType);
}

export async function getObjectAsText(bucketKey, key) {
  const bucket = ensureBucketKey(bucketKey);
  const response = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  const chunks = [];
  for await (const chunk of response.Body) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf-8");
}

// ------------------------------------------------------------
// 🔁 Legacy & Aliases
// ------------------------------------------------------------
export const putObject = uploadBuffer;
export const r2Put = uploadBuffer;
export const putText = uploadText;
export const getObject = getObjectAsText;
export const r2Get = getObjectAsText;
export const putJson = async (bucketKey, key, obj) =>
  uploadText(bucketKey, key, JSON.stringify(obj, null, 2), "application/json");

// ✅ Restored for models.js, rss-feed, and artwork
export function buildPublicUrl(bucketKey, key) {
  const base = R2_PUBLIC_URLS[bucketKey];
  if (!base) throw new Error(`❌ No public URL configured for ${bucketKey}`);
  return `${base}/${encodeURIComponent(key)}`;
}

// ------------------------------------------------------------
// 🧰 Utility Methods
// ------------------------------------------------------------
export async function listKeys(bucketKey, prefix = "") {
  const bucket = ensureBucketKey(bucketKey);
  const { Contents } = await s3.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix }));
  return Contents ? Contents.map((c) => c.Key) : [];
}

export async function deleteObject(bucketKey, key) {
  const bucket = ensureBucketKey(bucketKey);
  await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
  log.info({ bucket, key }, "🗑️ R2 object deleted");
}

// ------------------------------------------------------------
// 🧾 Startup Log
// ------------------------------------------------------------
log.info(
  { endpoint: R2_ENDPOINT, region: R2_REGION, buckets: Object.values(R2_BUCKETS) },
  "r2-client.initialized"
);

// ------------------------------------------------------------
// 📦 Default Export
// ------------------------------------------------------------
export default {
  s3,
  R2_BUCKETS,
  R2_PUBLIC_URLS,
  uploadBuffer,
  uploadText,
  getObjectAsText,
  deleteObject,
  listKeys,
  putObject,
  putJson,
  putText,
  buildPublicUrl, // ✅ restored for imports
  getObject,
  r2Put,
  r2Get,
};
