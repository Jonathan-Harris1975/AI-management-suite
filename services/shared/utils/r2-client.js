// services/shared/utils/r2-client.js
import { S3Client, PutObjectCommand, GetObjectCommand, HeadObjectCommand, DeleteObjectCommand, ListObjectsV2Command } from "@aws-sdk/client-s3";

/**
 * Required env:
 * - R2_ACCOUNT_ID
 * - R2_ACCESS_KEY_ID
 * - R2_SECRET_ACCESS_KEY
 * Optional:
 * - R2_ENDPOINT  (e.g. https://<accountid>.r2.cloudflarestorage.com)
 *
 * Buckets are passed per-call; do NOT hardcode bucket names here.
 */

function assertCreds() {
  const missing = [];
  if (!process.env.R2_ACCESS_KEY_ID) missing.push("R2_ACCESS_KEY_ID");
  if (!process.env.R2_SECRET_ACCESS_KEY) missing.push("R2_SECRET_ACCESS_KEY");
  if (!process.env.R2_ACCOUNT_ID && !process.env.R2_ENDPOINT) missing.push("R2_ACCOUNT_ID or R2_ENDPOINT");
  if (missing.length) {
    throw new Error(
      `R2 credentials misconfigured. Missing: ${missing.join(", ")}. ` +
      `Set env vars or provide a valid R2_ENDPOINT.`
    );
  }
}

let _client;
function client() {
  if (_client) return _client;
  assertCreds();

  const endpoint =
    process.env.R2_ENDPOINT ||
    `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;

  _client = new S3Client({
    region: "auto",
    endpoint,
    forcePathStyle: true,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    },
  });
  return _client;
}

// -------- helpers --------
async function streamToBuffer(bodyStream) {
  const chunks = [];
  for await (const chunk of bodyStream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

// -------- core ops (all named exports) --------

/** Put plain text */
export async function putText(bucket, key, text, contentType = "text/plain; charset=utf-8") {
  if (!bucket || !key) throw new Error("putText requires bucket and key");
  await client().send(new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: text,
    ContentType: contentType,
  }));
  return { bucket, key };
}

/** Put JSON (optionally pretty) */
export async function putJson(bucket, key, data, pretty = false) {
  const body = pretty ? JSON.stringify(data, null, 2) : JSON.stringify(data);
  return putText(bucket, key, body, "application/json; charset=utf-8");
}

/** Put Buffer/Uint8Array */
export async function putBuffer(bucket, key, buffer, contentType = "application/octet-stream") {
  if (!bucket || !key) throw new Error("putBuffer requires bucket and key");
  await client().send(new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: buffer,
    ContentType: contentType,
  }));
  return { bucket, key };
}

/** Get object as Buffer + minimal metadata */
export async function getObject(bucket, key) {
  if (!bucket || !key) throw new Error("getObject requires bucket and key");
  const res = await client().send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  const body = await streamToBuffer(res.Body);
  return {
    body,
    contentType: res.ContentType,
    contentLength: res.ContentLength,
    eTag: res.ETag,
    lastModified: res.LastModified,
    metadata: res.Metadata,
  };
}

/** Convenience: get object and decode as UTF-8 text */
export async function getObjectAsText(bucket, key) {
  const { body } = await getObject(bucket, key);
  return body.toString("utf8");
}

/** HEAD (metadata only) */
export async function headObject(bucket, key) {
  if (!bucket || !key) throw new Error("headObject requires bucket and key");
  return client().send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
}

/** Delete */
export async function deleteObject(bucket, key) {
  if (!bucket || !key) throw new Error("deleteObject requires bucket and key");
  await client().send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
  return { bucket, key, deleted: true };
}

/** List (prefix optional) */
export async function listObjects(bucket, prefix = "", limit = 1000, continuationToken) {
  if (!bucket) throw new Error("listObjects requires bucket");
  const res = await client().send(new ListObjectsV2Command({
    Bucket: bucket,
    Prefix: prefix,
    MaxKeys: limit,
    ContinuationToken: continuationToken,
  }));
  return {
    keys: (res.Contents || []).map(o => ({ key: o.Key, size: o.Size, lastModified: o.LastModified, eTag: o.ETag })),
    isTruncated: !!res.IsTruncated,
    nextToken: res.NextContinuationToken,
  };
                       }
