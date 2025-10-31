/**
 * R2 Client Utility
 * =================
 * Centralized Cloudflare R2 helper built on AWS SDK v3.
 * Supports both modern and legacy signatures.
 * Ensures consistent logging, error handling, and bucket resolution.
 */

import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
} from "@aws-sdk/client-s3";

import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { readFile } from "fs/promises";

// ---------- Configuration ----------
const {
  R2_ENDPOINT,
  R2_ACCESS_KEY_ID,
  R2_SECRET_ACCESS_KEY,
  R2_REGION,
  R2_BUCKET_PODCAST,
  R2_BUCKET_RAW,
  R2_BUCKET_RAW_TEXT,
  R2_BUCKET_MERGED,
  R2_META_BUCKET,
} = process.env;

const DEFAULT_REGION = R2_REGION || "auto";

// ---------- Client ----------
export const r2Client = new S3Client({
  region: DEFAULT_REGION,
  endpoint: R2_ENDPOINT,
  credentials: {
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
  },
  forcePathStyle: true,
});

// ---------- Helpers ----------
function logInfo(event, meta = {}) {
  console.log(JSON.stringify({ level: "INFO", event, ...meta }));
}

function logError(event, err, meta = {}) {
  console.error(JSON.stringify({ level: "ERROR", event, error: err?.message || err, ...meta }));
}

// ---------- Core Ops ----------

// ---- Upload (Buffer / JSON / Text) ----
export async function uploadBuffer({ bucket, key, body, contentType }) {
  if (!bucket) throw new Error("uploadBuffer: bucket is required");
  if (!key) throw new Error("uploadBuffer: key is required");

  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: body,
    ContentType: contentType || "application/octet-stream",
  });

  await r2Client.send(command);
  logInfo("r2.uploadBuffer.success", { bucket, key, size: body?.length || 0 });
  return true;
}

export async function putJson(bucket, key, json) {
  const body = Buffer.from(JSON.stringify(json, null, 2));
  return uploadBuffer({ bucket, key, body, contentType: "application/json" });
}

export async function putText(bucket, key, text) {
  const body = Buffer.from(text);
  return uploadBuffer({ bucket, key, body, contentType: "text/plain; charset=utf-8" });
}

// ---- Get Object as Text ----
export async function getObjectAsText(bucket, key) {
  try {
    const command = new GetObjectCommand({ Bucket: bucket, Key: key });
    const res = await r2Client.send(command);
    const body = await res.Body?.transformToString();
    logInfo("r2.getObjectAsText.success", { bucket, key, length: body?.length || 0 });
    return body;
  } catch (err) {
    if (err.name === "NoSuchKey") {
      logInfo("r2.getObjectAsText.notFound", { bucket, key });
      return null;
    }
    logError("r2.getObjectAsText.fail", err, { bucket, key });
    throw err;
  }
}

// ---- Existence ----
export async function objectExists(bucket, key) {
  try {
    await r2Client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    return true;
  } catch (err) {
    if (err.name === "NotFound") return false;
    throw err;
  }
}

// ---- Delete ----
export async function deleteObject(bucket, key) {
  try {
    await r2Client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
    logInfo("r2.deleteObject.success", { bucket, key });
    return true;
  } catch (err) {
    logError("r2.deleteObject.fail", err, { bucket, key });
    throw err;
  }
}

// ---- List ----
export async function listObjects(bucket, prefix = "") {
  const cmd = new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix });
  const res = await r2Client.send(cmd);
  return res.Contents || [];
}

// ---- Signed URL ----
export async function getSignedR2Url(bucket, key, expiresIn = 3600) {
  const command = new GetObjectCommand({ Bucket: bucket, Key: key });
  return getSignedUrl(r2Client, command, { expiresIn });
}

// ---------- LEGACY BACK-COMPAT WRAPPERS ----------
/**
 * Older code may call:
 *   r2Put(bucket, key, content, contentType)
 *   r2Get(bucket, key)
 *   r2Json(bucket, key, obj)
 * These wrappers forward to the modern functions.
 */
export async function r2Put(bucket, key, content, contentType) {
  const body = Buffer.isBuffer(content) ? content : Buffer.from(content || "");
  return uploadBuffer({ bucket, key, body, contentType });
}

export async function r2Get(bucket, key) {
  return getObjectAsText(bucket, key);
}

export async function r2Json(bucket, key, obj) {
  return putJson(bucket, key, obj);
}

// ---------- Export Common Bucket Map ----------
export const R2_BUCKETS = {
  podcast: R2_BUCKET_PODCAST,
  raw: R2_BUCKET_RAW,
  rawText: R2_BUCKET_RAW_TEXT,
  merged: R2_BUCKET_MERGED,
  meta: R2_META_BUCKET,
};

logInfo("r2-client.initialized", {
  endpoint: R2_ENDPOINT,
  region: DEFAULT_REGION,
  buckets: Object.keys(R2_BUCKETS).filter((k) => R2_BUCKETS[k]),
});
