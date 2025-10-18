// Minimal R2 client using AWS SDK v3 (S3-compatible)
import { S3Client, PutObjectCommand, HeadObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";

function jlog(message, meta = undefined) {
  const line = { time: new Date().toISOString(), message };
  if (meta && typeof meta === "object") line.meta = meta;
  process.stdout.write(JSON.stringify(line) + "\n");
}

const ACCESS_KEY = process.env.R2_ACCESS_KEY_ID;
const SECRET_KEY = process.env.R2_SECRET_ACCESS_KEY;
const BUCKET_RSS = process.env.R2_BUCKET_RSS_FEEDS;
const PUBLIC_BASE = process.env.R2_PUBLIC_BASE_URL_RSS || "";
const ENDPOINT = process.env.R2_S3_ENDPOINT || process.env.R2_ENDPOINT;
const REGION = process.env.R2_REGION || "auto";

const s3 = new S3Client({
  region: REGION,
  endpoint: ENDPOINT,
  credentials: {
    accessKeyId: ACCESS_KEY || "",
    secretAccessKey: SECRET_KEY || ""
  },
  forcePathStyle: true
});

export function getBucketName(){ return BUCKET_RSS; }
export function r2GetPublicBase(){ return PUBLIC_BASE?.replace(/\/+$/,""); }

export async function r2Put(bucket, key, body, contentType = "application/octet-stream") {
  const cmd = new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: contentType });
  return await s3.send(cmd);
}

export async function r2Head(bucket, key) {
  const cmd = new HeadObjectCommand({ Bucket: bucket, Key: key });
  return await s3.send(cmd);
}

export async function r2GetText(bucket, key) {
  try {
    const cmd = new GetObjectCommand({ Bucket: bucket, Key: key });
    const out = await s3.send(cmd);
    const stream = out.Body;
    const chunks = [];
    for await (const chunk of stream) chunks.push(Buffer.from(chunk));
    return Buffer.concat(chunks).toString("utf-8");
  } catch (e) {
    return "";
  }
}
