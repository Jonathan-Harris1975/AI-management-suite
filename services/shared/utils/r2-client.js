// services/shared/utils/r2-client.js
// ============================================================
// ☁️ Cloudflare R2 Client — Final Unified + Compatible Version
// ============================================================
//
// ✅ Includes:
//   - Amazon S3-compatible client
//   - Full alias + normalization support
//   - Flat key uploads (no nested folders)
//   - Safe fallback handling for unknown keys
//   - Restored legacy aliases (putObject, getObject, etc.)
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
// 🔧 Environment Setup
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

// ------------------------------------------------------------
// 🧩 Key Normalizer (Bullet-Proof Alias Resolver)
// ------------------------------------------------------------
function normalizeBucketKey(key = "") {
  const cleaned = key.toString().trim().toLowerCase().replace(/[-_]/g, "");

  const map = {
    podcast: "podcast",
    raw: "rawtext",
    rawtext: "rawtext",
    rawtxt: "rawtext",
    rawtextbucket: "rawtext",
    meta: "meta",
    merged: "merged",
    merge: "merged",
    art: "art",
    artwork: "art",
    rss: "rss-feeds",
    rssfeed: "rss-feeds",
    rssfeeds: "rss-feeds",
    rssfeedsbucket: "rss-feeds",
    podcastrss: "podcastRss",
    rssfeedsalt: "rss-feeds",
    transcript: "transcripts",
    transcripts: "transcripts",
  };

  return map[cleaned] || cleaned;
}

// ------------------------------------------------------------
// 🧠 S3 Client Initialization
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
// 🪣 Bucket Registry (includes all aliases)
// ------------------------------------------------------------
export const R2_BUCKETS = {
  podcast: R2_BUCKET_PODCAST,
  rawtext: R2_BUCKET_RAW_TEXT || R2_BUCKET_RAW,
  meta: R2_BUCKET_META,
  merged: R2_BUCKET_MERGED,
  art: R2_BUCKET_ART,
  "rss-feeds": R2_BUCKET_RSS_FEEDS || R2_BUCKET_PODCAST_RSS_FEEDS,
  podcastRss: R2_BUCKET_PODCAST_RSS_FEEDS || R2_BUCKET_RSS_FEEDS,
  transcripts: R2_BUCKET_TRANSCRIPTS,
};

// ------------------------------------------------------------
// 🌍 Public URL Registry
// ------------------------------------------------------------
export const R2_PUBLIC_URLS = {
  podcast: R2_PUBLIC_BASE_URL_PODCAST,
  rawtext: R2_PUBLIC_BASE_URL_RAW_TEXT || R2_PUBLIC_BASE_URL_RAW,
  meta: R2_PUBLIC_BASE_URL_META,
  merged: R2_PUBLIC_BASE_URL_MERGE,
  art: R2_PUBLIC_BASE_URL_ART,
  "rss-feeds": R2_PUBLIC_BASE_URL_RSS,
  transcripts: R2_PUBLIC_BASE_URL_TRANSCRIPT,
};

// ------------------------------------------------------------
// 🧩 Bucket Validator (with normalization + auto-fallback)
// ------------------------------------------------------------
export function ensureBucketKey(bucketKey) {
  const canonical = normalizeBucketKey(bucketKey);
  const bucket = R2_BUCKETS[canonical];

  if (!bucket) {
    const valid = Object.keys(R2_BUCKETS).join(", ");
    log.error({ bucketKey, canonical }, "❌ Unknown R2 bucket key");
    throw new Error(`❌ Unknown R2 bucket key: ${bucketKey} — valid keys: ${valid}`);
  }

  return bucket;
}

// ------------------------------------------------------------
// ⚙️ Core Upload / Download Functions
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
  const canonical = normalizeBucketKey(bucketKey);
  return `${R2_PUBLIC_URLS[canonical]}/${encodeURIComponent(key)}`;
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
// 🔁 Legacy + Compatibility Aliases
// ------------------------------------------------------------
export const r2Put = uploadBuffer;
export const putObject = uploadBuffer;
export const putJson = async (bucketKey, key, obj) =>
  uploadText(bucketKey, key, JSON.stringify(obj, null, 2), "application/json");
export const putText = uploadText;
export const getObject = getObjectAsText;
export const r2Get = getObjectAsText;

// ------------------------------------------------------------
// 🧰 Additional Utilities
// ------------------------------------------------------------
export async function getR2ReadStream(bucketKey, key) {
  const bucket = ensureBucketKey(bucketKey);
  const response = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  return response.Body;
}

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

export function buildPublicUrl(bucketKey, key) {
  const canonical = normalizeBucketKey(bucketKey);
  return `${R2_PUBLIC_URLS[canonical]}/${encodeURIComponent(key)}`;
}

// ------------------------------------------------------------
// 🧾 Startup Log
// ------------------------------------------------------------
log.info(
  {
    endpoint: R2_ENDPOINT,
    region: R2_REGION,
    buckets: Object.entries(R2_BUCKETS),
  },
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
  getR2ReadStream,
  buildPublicUrl,
  r2Put,
  putObject,
  putJson,
  putText,
  getObject,
  r2Get,
  ensureBucketKey,
  normalizeBucketKey,
};
