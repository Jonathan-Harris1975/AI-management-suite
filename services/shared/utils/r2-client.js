// services/shared/utils/r2-client.js
// ============================================================
// ☁️ Cloudflare R2 Client (Full Version)
// ============================================================

import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { log } from "#logger.js";

// --- Load environment ---
const {
  R2_ACCESS_KEY_ID,
  R2_SECRET_ACCESS_KEY,
  R2_ENDPOINT,
  R2_REGION,

  // ✅ All R2 Buckets
  R2_BUCKET_PODCAST,
  R2_BUCKET_RAW,
  R2_BUCKET_RAW_TEXT,
  R2_BUCKET_META,
  R2_BUCKET_MERGED,
  R2_BUCKET_ART,
  R2_BUCKET_RSS_FEEDS,
  R2_BUCKET_PODCAST_RSS_FEEDS,
  R2_BUCKET_TRANSCRIPTS,

  // Public URLs (for output linking)
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
// 🧠 R2 Client Setup
// ============================================================

export const r2Client = new S3Client({
  region: R2_REGION || "auto",
  endpoint: R2_ENDPOINT,
  credentials: {
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
  },
});

// ============================================================
// 🪣 Unified Bucket Map
// ============================================================

export const R2_BUCKETS = {
  podcast: R2_BUCKET_PODCAST,
  raw: R2_BUCKET_RAW,
  rawText: R2_BUCKET_RAW_TEXT,
  meta: R2_BUCKET_META,
  merged: R2_BUCKET_MERGED,
  art: R2_BUCKET_ART,
  rss: R2_BUCKET_RSS_FEEDS || R2_BUCKET_PODCAST_RSS_FEEDS || "rss-feeds",
  transcripts: R2_BUCKET_TRANSCRIPTS,
};

// ============================================================
// 🌍 Public URL Map
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
// ✅ Validation on Startup
// ============================================================

Object.entries(R2_BUCKETS).forEach(([key, val]) => {
  if (!val) {
    console.warn(`⚠️ R2 bucket missing or undefined: ${key}`);
  }
});

log.info(
  { endpoint: R2_ENDPOINT, region: R2_REGION, buckets: Object.values(R2_BUCKETS) },
  "r2-client.initialized"
);

// ============================================================
// 📦 Utility Functions
// ============================================================

export async function uploadBuffer(bucketKey, key, buffer, contentType = "application/octet-stream") {
  const bucket = R2_BUCKETS[bucketKey];
  if (!bucket) throw new Error(`Unknown R2 bucket key: ${bucketKey}`);

  await r2Client.send(
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
  const bucket = R2_BUCKETS[bucketKey];
  if (!bucket) throw new Error(`Unknown R2 bucket key: ${bucketKey}`);

  const command = new GetObjectCommand({ Bucket: bucket, Key: key });
  const response = await r2Client.send(command);
  const chunks = [];
  for await (const chunk of response.Body) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf-8");
}

// ============================================================
// ✅ Default Export
// ============================================================

export default {
  r2Client,
  R2_BUCKETS,
  R2_PUBLIC_URLS,
  uploadBuffer,
  uploadText,
  getObjectAsText,
};
