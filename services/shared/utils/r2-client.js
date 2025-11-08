
// services/shared/utils/r2-client.js
// Cloudflare R2 client — full helpers for this repo

import { S3Client, PutObjectCommand, GetObjectCommand, ListObjectsV2Command } from "@aws-sdk/client-s3";
import { Readable } from "stream";

const endpoint = process.env.R2_ENDPOINT || process.env.CF_R2_ENDPOINT;
const region = process.env.R2_REGION || "auto";
const accessKeyId = process.env.R2_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID;
const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY || process.env.AWS_SECRET_ACCESS_KEY;

if (!endpoint || !accessKeyId || !secretAccessKey) {
  throw new Error("R2 client missing required env (R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY)");
}

export const R2_BUCKETS = {
  PODCAST: process.env.R2_BUCKET_PODCAST || "podcast",
  MERGED: process.env.R2_BUCKET_MERGED || "podcast-merged",
  META: process.env.R2_BUCKET_META || "podcast-meta",
  RAW: process.env.R2_BUCKET_RAW || "podcast-chunks",
  RAW_TEXT: process.env.R2_BUCKET_RAW_TEXT || "raw-text",
  ART: process.env.R2_BUCKET_ART || process.env.R2_BUCKET_ARTWORK || "artwork",
  TRANSCRIPTS: process.env.R2_BUCKET_TRANSCRIPTS || "transcripts",
};

export const R2_PUBLIC = {
  PODCAST: process.env.R2_PUBLIC_BASE_URL_PODCAST,
  MERGED: process.env.R2_PUBLIC_BASE_URL_MERGE,
  META: process.env.R2_PUBLIC_BASE_URL_META,
  RAW: process.env.R2_PUBLIC_BASE_URL_RAW,
  RAW_TEXT: process.env.R2_PUBLIC_BASE_URL_RAW_TEXT,
  ART: process.env.R2_PUBLIC_BASE_URL_ART,
  TRANSCRIPTS: process.env.R2_PUBLIC_BASE_URL_TRANSCRIPTS || process.env.R2_PUBLIC_BASE_URL_RAW, // fallback
};

const client = new S3Client({
  region,
  endpoint,
  forcePathStyle: true,
  credentials: { accessKeyId, secretAccessKey }
});

export function buildPublicUrl(bucket, key) {
  const base = R2_PUBLIC[bucket] || Object.values(R2_PUBLIC).find(Boolean);
  return base ? `${base.replace(/\/$/,'')}/${key}` : null;
}

export async function putObject(bucket, key, body, contentType = "application/octet-stream"){
  const cmd = new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: contentType });
  await client.send(cmd);
  return { bucket, key, url: buildPublicUrl(bucket, key) };
}

export async function uploadText(bucket, key, text, contentType = "text/plain"){
  const buf = Buffer.from(text, "utf-8");
  return putObject(bucket, key, buf, contentType);
}

export async function uploadBuffer(bucket, key, buffer, contentType = "application/octet-stream"){
  return putObject(bucket, key, buffer, contentType);
}

export async function putJson(bucket, key, obj){
  return uploadText(bucket, key, JSON.stringify(obj, null, 2), "application/json");
}

export async function getObjectAsText(bucket, key){
  const cmd = new GetObjectCommand({ Bucket: bucket, Key: key });
  const res = await client.send(cmd);
  const stream = res.Body;
  const chunks = [];
  for await (const c of stream instanceof Readable ? stream : Readable.from(stream)) chunks.push(Buffer.from(c));
  return Buffer.concat(chunks).toString("utf-8");
}

export async function listKeys({ bucket, prefix = "" }){
  const keys = [];
  let ContinuationToken = undefined;
  do {
    const res = await client.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, ContinuationToken }));
    (res.Contents || []).forEach(obj => keys.push(obj.Key));
    ContinuationToken = res.IsTruncated ? res.NextContinuationToken : undefined;
  } while (ContinuationToken);
  return keys;
}

export default { putObject, uploadText, uploadBuffer, putJson, getObjectAsText, listKeys, R2_BUCKETS, R2_PUBLIC, buildPublicUrl };
