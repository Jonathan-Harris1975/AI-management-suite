// /services/shared/utils/r2-client.js
// ✅ Universal R2 client for AI Podcast Suite (2025-10-31)
// Compatible with both legacy and new services (rss, toneSetter, feedRotation, etc.)

import { S3Client, GetObjectCommand, ListObjectsV2Command, PutObjectCommand } from "@aws-sdk/client-s3";
import pino from "pino";
import { env } from "process";

const logger = pino({ level: env.LOG_LEVEL || "info" });

// -----------------------------------------------------------------------------
// R2 connection bootstrap
// -----------------------------------------------------------------------------
export const s3 = new S3Client({
  region: "auto",
  endpoint: env.R2_ENDPOINT || "https://<your-cloudflare-account>.r2.cloudflarestorage.com",
  credentials: {
    accessKeyId: env.R2_ACCESS_KEY_ID,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY,
  },
});

// -----------------------------------------------------------------------------
// R2 bucket constants — used across toneSetter, rssFeedCreator, etc.
// -----------------------------------------------------------------------------
export const R2_BUCKETS = {
  PODCAST: env.R2_BUCKET_PODCAST || "podcast",
  RAW: env.R2_BUCKET_RAW || "podcast-chunks",
  RAW_TEXT: env.R2_BUCKET_RAW_TEXT || "raw-text",
  MERGED: env.R2_BUCKET_MERGED || "podcast-merged",
  META: env.R2_META_BUCKET || "podcast-meta",
  FEEDS: env.R2_BUCKET_FEEDS || "rss-feeds",
};

// -----------------------------------------------------------------------------
// Utilities
// -----------------------------------------------------------------------------
async function streamToString(stream) {
  if (!stream) return "";
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
}

// -----------------------------------------------------------------------------
// Get object as text
// -----------------------------------------------------------------------------
export async function getObjectAsText(bucket, key) {
  try {
    const cmd = new GetObjectCommand({ Bucket: bucket, Key: key });
    const res = await s3.send(cmd);
    const body = await streamToString(res.Body);
    logger.info({ service: "ai-podcast-suite", bucket, key, length: body.length }, "r2.getObjectAsText.success");
    return body;
  } catch (err) {
    logger.error({ service: "ai-podcast-suite", bucket, key, err: err.message }, "r2.getObjectAsText.fail");
    return null;
  }
}

// -----------------------------------------------------------------------------
// Upload buffer
// -----------------------------------------------------------------------------
export async function uploadBuffer(bucket, key, buffer) {
  try {
    const cmd = new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: buffer,
      ContentType: "application/octet-stream",
    });
    await s3.send(cmd);
    logger.info({ service: "ai-podcast-suite", bucket, key, size: buffer.length }, "r2.uploadBuffer.success");
    return true;
  } catch (err) {
    logger.error({ service: "ai-podcast-suite", bucket, key, err: err.message }, "r2.uploadBuffer.fail");
    return false;
  }
}

// -----------------------------------------------------------------------------
// Upload string
// -----------------------------------------------------------------------------
export async function uploadString(bucket, key, str) {
  const buf = Buffer.from(str, "utf8");
  return uploadBuffer(bucket, key, buf);
}

// -----------------------------------------------------------------------------
// Upload JSON + alias (putJson)
// -----------------------------------------------------------------------------
export async function uploadJSON(bucket, key, obj) {
  const buf = Buffer.from(JSON.stringify(obj, null, 2), "utf8");
  return uploadBuffer(bucket, key, buf);
}
export const putJson = uploadJSON;

// -----------------------------------------------------------------------------
// List keys in a bucket (legacy compatibility)
// -----------------------------------------------------------------------------
export async function listKeys(bucket, prefix = "") {
  try {
    const cmd = new ListObjectsV2Command({
      Bucket: bucket,
      Prefix: prefix,
    });
    const res = await s3.send(cmd);
    const keys = res?.Contents?.map((c) => c.Key) || [];
    logger.info({ service: "ai-podcast-suite", bucket, prefix, count: keys.length }, "r2.listKeys.success");
    return keys;
  } catch (err) {
    logger.error({ service: "ai-podcast-suite", bucket, prefix, err: err.message }, "r2.listKeys.fail");
    return [];
  }
}

// -----------------------------------------------------------------------------
// Export all
// -----------------------------------------------------------------------------
export default {
  s3,
  R2_BUCKETS,
  getObjectAsText,
  uploadBuffer,
  uploadString,
  uploadJSON,
  putJson,
  listKeys,
};
