// /services/shared/utils/r2-client.js

import { S3Client, GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import pino from "pino";

const logger = pino({ level: process.env.LOG_LEVEL || "info" });

const client = new S3Client({
  region: "auto",
  endpoint: process.env.R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

async function streamToString(stream) {
  if (!stream) return "";
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
}

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

export async function uploadBuffer(bucket, key, buffer) {
  try {
    const cmd = new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: buffer,
      ContentType: "application/octet-stream",
    });
    await client.send(cmd);
    logger.info({ service: "ai-podcast-suite", bucket, key, size: buffer.length }, "r2.uploadBuffer.success");
    return true;
  } catch (err) {
    logger.error({ service: "ai-podcast-suite", bucket, key, err: err.message }, "r2.uploadBuffer.fail");
    return false;
  }
}

export async function uploadJSON(bucket, key, obj) {
  const buf = Buffer.from(JSON.stringify(obj, null, 2), "utf8");
  return uploadBuffer(bucket, key, buf);
}

// ✅ Legacy alias — feedRotationManager.js uses this name
export const putJson = uploadJSON;

export async function uploadString(bucket, key, str) {
  const buf = Buffer.from(str, "utf8");
  return uploadBuffer(bucket, key, buf);
}

export default { getObjectAsText, uploadBuffer, uploadJSON, putJson, uploadString };
