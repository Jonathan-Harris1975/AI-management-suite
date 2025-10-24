/**
 * R2 Client Utility
 * Unified helper for reading/writing Cloudflare R2 (S3-compatible) objects.
 * Fixes the common “No value provided for input HTTP label: Key.” error by
 * validating and normalising all bucket/key inputs.
 */

import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
  ListObjectsV2Command,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { info, error } from '#logger.js';

// Create R2 client
const r2Client = new S3Client({
  region: process.env.R2_REGION || 'auto',
  endpoint: process.env.R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
  forcePathStyle: true,
});

/**
 * Normalise bucket/key combinations.
 * - If bucket contains a slash or a file extension, assume it's actually the key.
 * - If key is missing, infer the correct key and bucket from env or defaults.
 */
function normalizeBucketKey(bucket, key) {
  const defaultBucket =
    process.env.R2_BUCKET_RSS_FEEDS ||
    process.env.R2_BUCKET_PODCAST ||
    'rss-feeds';

  // Case 1: Key missing but bucket looks like a key (has / or file extension)
  if (!key && bucket && (bucket.includes('/') || /\.[a-z0-9]+$/i.test(bucket))) {
    const inferred = { bucket: defaultBucket, key: bucket };
    info('r2.normalize.inferred', inferred);
    return inferred;
  }

  // Case 2: Bucket accidentally includes key fragments
  if (bucket && bucket.includes('/') && key) {
    const [maybeBucket, ...rest] = bucket.split('/');
    if (maybeBucket && !maybeBucket.includes('.')) {
      const joinedKey = rest.length ? `${rest.join('/')}/${key}` : key;
      const fixed = { bucket: maybeBucket, key: joinedKey };
      info('r2.normalize.fixed', fixed);
      return fixed;
    }
  }

  // Case 3: Bucket undefined
  if (!bucket) {
    const fixed = { bucket: defaultBucket, key };
    info('r2.normalize.defaultBucket', fixed);
    return fixed;
  }

  // Default (looks valid)
  return { bucket, key };
}

/**
 * Reads object and returns it as UTF-8 text.
 */
export async function getObjectAsText(bucket, key) {
  ({ bucket, key } = normalizeBucketKey(bucket, key));
  if (!bucket || !key)
    throw new Error(`Invalid R2 parameters: bucket=${bucket}, key=${key}`);

  try {
    const command = new GetObjectCommand({ Bucket: bucket, Key: key });
    const res = await r2Client.send(command);
    const text = await res.Body.transformToString();
    info('r2.getObjectAsText.success', { bucket, key, length: text.length });
    return text;
  } catch (err) {
    error('r2.getObjectAsText.fail', { bucket, key, error: err.message });
    throw err;
  }
}

/**
 * Reads object and parses it as JSON.
 */
export async function getObjectAsJson(bucket, key) {
  const text = await getObjectAsText(bucket, key);
  try {
    return JSON.parse(text);
  } catch (err) {
    error('r2.getObjectAsJson.fail', { bucket, key, error: err.message });
    throw err;
  }
}

/**
 * Uploads a text buffer or string to R2.
 */
export async function uploadBuffer(bucket, key, data, contentType = 'text/plain') {
  ({ bucket, key } = normalizeBucketKey(bucket, key));
  try {
    const command = new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: Buffer.isBuffer(data) ? data : Buffer.from(data),
      ContentType: contentType,
    });
    await r2Client.send(command);
    info('r2.uploadBuffer.success', { bucket, key, size: data.length });
    return true;
  } catch (err) {
    error('r2.uploadBuffer.fail', { bucket, key, error: err.message });
    throw err;
  }
}

/**
 * Upload JSON to R2 as a formatted string.
 */
export async function uploadJson(bucket, key, json) {
  const data = JSON.stringify(json, null, 2);
  return uploadBuffer(bucket, key, data, 'application/json');
}

/**
 * List all keys under a prefix.
 */
export async function listKeys(bucket, prefix = '') {
  ({ bucket } = normalizeBucketKey(bucket));
  try {
    const command = new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix });
    const res = await r2Client.send(command);
    const keys = (res.Contents || []).map(obj => obj.Key);
    info('r2.listKeys.success', { bucket, prefix, count: keys.length });
    return keys;
  } catch (err) {
    error('r2.listKeys.fail', { bucket, prefix, error: err.message });
    throw err;
  }
}

/**
 * Delete an object by key.
 */
export async function deleteObject(bucket, key) {
  ({ bucket, key } = normalizeBucketKey(bucket, key));
  try {
    const command = new DeleteObjectCommand({ Bucket: bucket, Key: key });
    await r2Client.send(command);
    info('r2.deleteObject.success', { bucket, key });
    return true;
  } catch (err) {
    error('r2.deleteObject.fail', { bucket, key, error: err.message });
    throw err;
  }
}

export default {
  getObjectAsText,
  getObjectAsJson,
  uploadBuffer,
  uploadJson,
  listKeys,
  deleteObject,
};
