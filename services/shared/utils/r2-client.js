// /services/shared/utils/r2-client.js
// ✅ Centralized R2 client — full version

import { S3Client, GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { Readable } from "stream";
import { env } from "process";
import pino from "pino";

const logger = pino({ level: process.env.LOG_LEVEL || "info" });

const client = new S3Client({
  region: "auto",
  endpoint: env.R2_ENDPOINT || "https://<your-cloudflare-account>.r2.cloudflarestorage.com",
  credentials: {
    accessKeyId: env.R2_ACCESS_KEY_ID,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY,
  },
});

/**
 * Convert an R2 (S3) stream to string
 */
async function streamToString(stream) {
  if (!stream) return "";
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
}

/**
 * Read object as text
 */
export async function getObjectAsText(bucket, key) {
  try {
    const cmd = new GetObjectCommand({ Bucket: bucket, Key: key });
    const res = await client.send(cmd);
    const body = await streamToString(res.Body);
    logger.info({ service: "ai-podcast-suite", bucket, key, length: body.length }, "r2.getObjectAsText.success");
    return body;
  } catch (err) {
    logger.error({ service: "ai-podcast-suite", bucket, key, err: err.message }, "r2.getObjectAsText.fail");
    return null;
  }
}

/**
 * Upload a text or buffer payload to R2
 */
export async function uploadBuffer(bucket, key, buffer) {
  try {
    const cmd = new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: buffer,
      ContentType: "application/xml",
    });
    await client.send(cmd);
    logger.info({ service: "ai-podcast-suite", bucket, key, size: buffer.length }, "r2.uploadBuffer.success");
    return true;
  } catch (err) {
    logger.error({ service: "ai-podcast-suite", bucket, key, err: err.message }, "r2.uploadBuffer.fail");
    return false;
  }
}

/**
 * Upload JSON directly
 */
export async function uploadJSON(bucket, key, obj) {
  const buf = Buffer.from(JSON.stringify(obj, null, 2), "utf8");
  return uploadBuffer(bucket, key, buf);
}

/**
 * Write string
 */
export async function uploadString(bucket, key, str) {
  const buf = Buffer.from(str, "utf8");
  return uploadBuffer(bucket, key, buf);
}

export default { getObjectAsText, uploadBuffer, uploadJSON, uploadString };
