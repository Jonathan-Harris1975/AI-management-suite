// services/shared/utils/r2-client.js
// ============================================================
// ☁️ Cloudflare R2 Client — Final Unified & Backward-Compatible Version
// ============================================================

import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { log } from "#logger.js";

// ============================================================
// 🔧 Environment Setup
// ============================================================

const {
  R2_ACCESS_KEY_ID,
  R2_SECRET_ACCESS_KEY,
  R2_ENDPOINT,
  R2_REGION,

  // Buckets (validated by envBootstrap)
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
} = process.env;

// ============================================================
// 🧠 Client Initialization
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
// 🪣 Bucket Registry (Complete, with Aliases)
// ============================================================

export const R2_BUCKETS = {
  podcast: R2_BUCKET_PODCAST,
  raw: R2_BUCKET_RAW,
  rawtext: R2_BUCKET_RAW_TEXT,
  rawText: R2_BUCKET_RAW_TEXT,
  meta: R2_BUCKET_META,
  merged: R2_BUCKET_MERGED,
  art: R2_BUCKET_ART,

  // ✅ RSS aliases
  rss: R2_BUCKET_RSS_FEEDS || R2_BUCKET_PODCAST_RSS_FEEDS || "rss-feeds",
  podcastRss: R2_BUCKET_PODCAST_RSS_FEEDS || R2_BUCKET_RSS_FEEDS || "rss-feeds",
  rssfeeds: R2_BUCKET_RSS_FEEDS || "rss-feeds",

  // ✅ Transcript aliases
  transcripts: R2_BUCKET_TRANSCRIPTS,
  transcript: R2_BUCKET_TRANSCRIPTS,
};

// ============================================================
// 🌍 Public URL Registry
// ============================================================

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
  transcripts: R2_PUBLIC_BASE_URL_TRANSCRIPT,
};

// ============================================================
// 🧩 Bucket Validator
// ============================================================

export function ensureBucketKey(bucketKey) {
  const bucket = R2_BUCKETS[bucketKey];
  if (!bucket) {
    const valid = Object.keys(R2_BUCKETS).join(", ");
    throw new Error(`❌ Unknown R2 bucket key: ${bucketKey} — valid keys: ${valid}`);
  }
  return bucket;
}

// ============================================================
// ⚙️ Core Upload / Download Functions
// ============================================================

export async function uploadBuffer(bucketKey, key, buffer, contentType = "application/octet-stream") {
  const bucket = ensureBucketKey(bucketKey);
  const cleanKey = key.startsWith("/") ? key.slice(1) : key;
  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: cleanKey,
      Body: buffer,
      ContentType: contentType,
    })
  );
  const base = R2_PUBLIC_URLS[bucketKey];
  return base ? `${base}/${encodeURIComponent(cleanKey)}` : `${R2_ENDPOINT}/${bucket}/${encodeURIComponent(cleanKey)}`;
}

export async function uploadText(bucketKey, key, text, contentType = "text/plain") {
  return uploadBuffer(bucketKey, key, Buffer.from(text, "utf-8"), contentType);
}

export async function getObjectAsText(bucketKey, key) {
  const bucket = ensureBucketKey(bucketKey);
  const cleanKey = key.startsWith("/") ? key.slice(1) : key;
  const response = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: cleanKey }));
  const chunks = [];
  for await (const chunk of response.Body) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf-8");
}

// ============================================================
// 🔁 Backward-Compatible Aliases
// ============================================================

export const r2Put = uploadBuffer;
export const putJson = async (bucketKey, key, obj) =>
  uploadText(bucketKey, key, JSON.stringify(obj, null, 2), "application/json");
export const putText = uploadText;
export const putObject = uploadBuffer;
export const getObject = getObjectAsText;
export const r2Get = getObjectAsText;

// Stream helper
export async function getR2ReadStream(bucketKey, key) {
  const bucket = ensureBucketKey(bucketKey);
  const cleanKey = key.startsWith("/") ? key.slice(1) : key;
  const response = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: cleanKey }));
  return response.Body;
}

// List keys in bucket
export async function listKeys(bucketKey, prefix = "") {
  const bucket = ensureBucketKey(bucketKey);
  const cleanPrefix = prefix.startsWith("/") ? prefix.slice(1) : prefix;
  const { Contents } = await s3.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: cleanPrefix }));
  return Contents ? Contents.map((c) => c.Key) : [];
}

// Delete object
export async function deleteObject(bucketKey, key) {
  const bucket = ensureBucketKey(bucketKey);
  const cleanKey = key.startsWith("/") ? key.slice(1) : key;
  await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: cleanKey }));
  log.info({ bucket, key: cleanKey }, "🗑️ R2 object deleted");
}

// Build public URL
export function buildPublicUrl(bucketKey, key) {
  const cleanKey = key.startsWith("/") ? key.slice(1) : key;
  const base = R2_PUBLIC_URLS[bucketKey];
  return base ? `${base}/${encodeURIComponent(cleanKey)}` : `${R2_ENDPOINT}/${ensureBucketKey(bucketKey)}/${encodeURIComponent(cleanKey)}`;
}

// ============================================================
// 🧩 Startup Logging
// ============================================================

log.info(
  { endpoint: R2_ENDPOINT, region: R2_REGION, buckets: R2_BUCKETS },
  "r2-client.initialized"
);

// ============================================================
// 📦 Default Export
// ============================================================

export default {
  s3,
  R2_BUCKETS,
  R2_PUBLIC_URLS,
  uploadBuffer,
  uploadText,
  getObjectAsText,
  deleteObject,
  listKeys,
  getR2ReadStream,
  buildPublicUrl,
  // Legacy aliases
  r2Put,
  putJson,
  putText,
  putObject,
  getObject,
  r2Get,
};
