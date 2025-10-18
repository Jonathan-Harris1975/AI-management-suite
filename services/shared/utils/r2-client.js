// ============================================================
// 🧠 AI Podcast Suite — Unified Cloudflare R2 Client
// ============================================================
//
// - Centralized S3Client config for Cloudflare R2
// - Upload / download / list helpers
// - Stream helper for ffmpeg
// ============================================================

import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
  ListObjectsV2Command,
} from "@aws-sdk/client-s3";
import { info, error } from "#shared/logger.js";

// ------------------------------------------------------------
// R2 Connection Setup
// ------------------------------------------------------------
const R2_ENDPOINT = process.env.R2_ENDPOINT;
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
const R2_REGION = process.env.R2_REGION || "auto";

if (!R2_ENDPOINT || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY) {
  error("r2.missing.config", {
    R2_ENDPOINT: !!R2_ENDPOINT,
    R2_ACCESS_KEY_ID: !!R2_ACCESS_KEY_ID,
    R2_SECRET_ACCESS_KEY: !!R2_SECRET_ACCESS_KEY,
  });
}

export const s3 = new S3Client({
  region: R2_REGION,
  endpoint: R2_ENDPOINT,
  credentials: {
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
  },
});

// Back-compat alias
export const r2Client = s3;

// ------------------------------------------------------------
// Buckets map
// ------------------------------------------------------------
export const R2_BUCKETS = {
  RAW: process.env.R2_BUCKET_RAW,
  RAW_TEXT: process.env.R2_BUCKET_RAW_TEXT,
  MERGED: process.env.R2_BUCKET_MERGED,
  PODCAST: process.env.R2_BUCKET_PODCAST,
  META: process.env.R2_BUCKET_META,
  RSS_FEEDS: process.env.R2_BUCKET_RSS_FEEDS,
  ART: process.env.R2_BUCKET_ART,
  CHUNKS: process.env.R2_BUCKET_CHUNKS,
  TRANSCRIPTS: process.env.R2_BUCKET_TRANSCRIPTS,
};

// ------------------------------------------------------------
// Core Upload Helpers
// ------------------------------------------------------------
export async function uploadBuffer({ bucket, key, body, contentType }) {
  try {
    const cmd = new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ...(contentType ? { ContentType: contentType } : {}),
    });
    await s3.send(cmd);
    info("r2.uploadBuffer.success", { bucket, key, size: body?.length });
  } catch (err) {
    error("r2.uploadBuffer.fail", { bucket, key, error: err.message });
    throw err;
  }
}

// Back-compat simple helper (string/Buffer)
export async function uploadFileToR2(bucket, key, content, contentType) {
  const body =
    typeof content === "string" ? Buffer.from(content) : Buffer.from(content);
  return uploadBuffer({
    bucket,
    key,
    body,
    contentType: contentType || "application/octet-stream",
  });
}

export async function putJson(bucket, key, data) {
  const body = Buffer.from(JSON.stringify(data));
  return uploadBuffer({
    bucket,
    key,
    body,
    contentType: "application/json; charset=utf-8",
  });
}

export async function putText(bucket, key, text, contentType = "text/plain") {
  const body = Buffer.from(typeof text === "string" ? text : String(text));
  return uploadBuffer({ bucket, key, body, contentType });
}

// ------------------------------------------------------------
// Core Download Helpers
// ------------------------------------------------------------
export async function getObject(bucket, key) {
  try {
    const cmd = new GetObjectCommand({ Bucket: bucket, Key: key });
    const out = await s3.send(cmd);
    const buf = Buffer.from(await out.Body?.transformToByteArray?.());
    info("r2.getObject.success", { bucket, key, size: buf.length });
    return buf;
  } catch (err) {
    error("r2.getObject.fail", { bucket, key, error: err.message });
    throw err;
  }
}

export async function getObjectAsText(bucket, key) {
  try {
    const cmd = new GetObjectCommand({ Bucket: bucket, Key: key });
    const out = await s3.send(cmd);
    const text = await out.Body?.transformToString?.();
    info("r2.getObjectAsText.success", { bucket, key, length: text?.length });
    return text;
  } catch (err) {
    error("r2.getObjectAsText.fail", { bucket, key, error: err.message });
    throw err;
  }
}

// ------------------------------------------------------------
// 🔥 Stream helper — for ffmpeg etc.
// ------------------------------------------------------------
export async function getR2ReadStream(bucket, key) {
  try {
    const command = new GetObjectCommand({ Bucket: bucket, Key: key });
    const response = await s3.send(command);
    if (!response.Body) {
      throw new Error(`No body returned for ${key} in bucket ${bucket}`);
    }
    info("r2.getR2ReadStream.success", { bucket, key });
    return response.Body; // readable stream
  } catch (err) {
    error("r2.getR2ReadStream.fail", { bucket, key, error: err.message });
    throw err;
  }
}

// ------------------------------------------------------------
// List Keys Utility
// ------------------------------------------------------------
export async function listKeys({ bucket, prefix }) {
  try {
    const out = await s3.send(
      new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix })
    );
    const keys = (out.Contents || []).map((o) => o.Key).filter(Boolean);
    info("r2.listKeys.success", { bucket, prefix, count: keys.length });
    return keys;
  } catch (err) {
    error("r2.listKeys.fail", { bucket, prefix, error: err.message });
    throw err;
  }
                                        }
