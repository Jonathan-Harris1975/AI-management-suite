// ============================================================
// ☁️ Cloudflare R2 Client — Stable Unsigned Version (Final)
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
// 🔧 Environment Variables
// ============================================================

const {
  R2_ACCESS_KEY_ID,
  R2_SECRET_ACCESS_KEY,
  R2_ENDPOINT,
  R2_REGION,

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
// 🧠 R2 Client Initialization
// ============================================================

const cleanEndpoint = (R2_ENDPOINT || "").replace(/\/+$/, "").trim();

// ⚡ Critical change — disable AWS SigV4 and enforce R2 path-style mode
export const s3 = new S3Client({
  endpoint: cleanEndpoint,
  region: "auto", // Cloudflare R2 ignores AWS regions
  forcePathStyle: true, // required for R2 compatibility
  signer: null, // 🚫 disables AWS request signing completely
  credentials: {
    accessKeyId: (R2_ACCESS_KEY_ID || "").trim(),
    secretAccessKey: (R2_SECRET_ACCESS_KEY || "").trim(),
  },
});
log.info({ endpoint: cleanEndpoint, region: "auto" }, "✅ R2 S3 client initialized (unsigned)");

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
// ⚙️ Core Functions
// ============================================================

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

// ============================================================
// 🔁 Aliases
// ============================================================

export const r2Put = uploadBuffer;
export const putJson = async (bucketKey, key, obj) =>
  uploadText(bucketKey, key, JSON.stringify(obj, null, 2), "application/json");
export const putText = uploadText;
export const putObject = uploadBuffer;
export const getObject = getObjectAsText;
export const r2Get = getObjectAsText;

// ============================================================
// 🧩 Utility Helpers
// ============================================================

export async function listKeys(bucketKey, prefix = "") {
  const bucket = ensureBucketKey(bucketKey);
  const { Contents } = await s3.send(
    new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix })
  );
  return Contents ? Contents.map((c) => c.Key) : [];
}

export async function getR2ReadStream(bucketKey, key) {
  const bucket = ensureBucketKey(bucketKey);
  const response = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  return response.Body;
}

export async function deleteObject(bucketKey, key) {
  const bucket = ensureBucketKey(bucketKey);
  await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
  log.info({ bucket, key }, "🗑️ Deleted R2 object");
}

export function buildPublicUrl(bucketKey, key) {
  return `${R2_PUBLIC_URLS[bucketKey]}/${encodeURIComponent(key)}`;
}

// ============================================================
// 🧾 Default Export
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
  // aliases
  r2Put,
  putJson,
  putText,
  putObject,
  getObject,
  r2Get,
};
