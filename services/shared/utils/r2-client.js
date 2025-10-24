/**
 * services/shared/utils/r2-client.js
 *
 * Robust Cloudflare R2 (S3-compatible) helper.
 * - Backwards-compatible with both positional and object-style calls.
 * - Normalises bucket/key inputs and guards against "No value provided for input HTTP label: Key."
 * - Exports `s3`, `R2_BUCKETS`, and the helper functions used across the repo.
 *
 * Usage patterns supported:
 *  - getObjectAsText(bucket, key)
 *  - getObjectAsText({ bucket, key })
 *  - uploadBuffer(bucket, key, data, contentType)
 *  - uploadBuffer({ bucket, key, body, contentType })
 *
 * Keep this file in /services/shared/utils/r2-client.js
 */

import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
  ListObjectsV2Command,
  DeleteObjectCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3';
import { pipeline } from 'stream';
import { promisify } from 'util';
const pipelineAsync = promisify(pipeline);

// Lightweight structured logger used by the repo. Replace with your logger if necessary.
// The project previously imported `#logger.js` — use it if your bundler resolves it; otherwise fallback.
let info = (...args) => console.info('[r2-client]', ...args);
let warn = (...args) => console.warn('[r2-client]', ...args);
let error = (...args) => console.error('[r2-client]', ...args);
try {
  // prefer project logger if available
  // eslint-disable-next-line node/no-missing-require
  // import dynamic not possible here in all bundlers; attempt require
  // If your project provides a logger under '#logger.js', this will pick it up at runtime.
  // If bundler rewrites imports, remove this try block and use your preferred logger import.
  // NOTE: this try is intentionally permissive to avoid failing in environments where '#logger.js' isn't resolvable.
  // If your codebase *requires* a specific logger, replace with that import.
  // Do not fail if unavailable.
  // eslint-disable-next-line global-require, import/no-extraneous-dependencies
  const maybe = require('#logger.js');
  if (maybe && typeof maybe.info === 'function') {
    info = maybe.info;
    warn = maybe.warn || maybe.info;
    error = maybe.error || maybe.info;
  }
} catch (e) {
  // keep console.* fallback
}

/* -------------------------------------------------------------------------- */
/*  Client and config                                                           */
/* -------------------------------------------------------------------------- */

const s3 = new S3Client({
  region: process.env.R2_REGION || 'auto',
  endpoint: process.env.R2_ENDPOINT || process.env.R2_URL || undefined,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID || process.env.R2_KEY || process.env.R2_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || process.env.R2_SECRET,
  },
  forcePathStyle: true,
});

// Default buckets used by the project (keeps callers concise)
export const R2_BUCKETS = {
  RSS_FEEDS: process.env.R2_BUCKET_RSS_FEEDS || process.env.R2_BUCKET || 'rss-feeds',
  PODCAST: process.env.R2_BUCKET_PODCAST || process.env.R2_BUCKET || 'podcast',
  RAW_TEXT: process.env.R2_BUCKET_RAW_TEXT || process.env.R2_BUCKET || 'raw-text',
  ARTWORK: process.env.R2_BUCKET_ARTWORK || process.env.R2_BUCKET || 'artwork',
  // add more sensible defaults if your services rely on them
};

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Accepts either:
 * - (bucket, key)
 * - ({ bucket, key })
 * - (bucket) where bucket actually contains a key path -> infer real bucket
 *
 * Returns { bucket, key }
 */
function parseBucketKeyArgs(a, b) {
  // object form
  if (a && typeof a === 'object' && (a.bucket || a.key || a.body || a.prefix)) {
    return { bucket: a.bucket, key: a.key, body: a.body, prefix: a.prefix };
  }
  // positional form: (bucket, key)
  if (typeof a === 'string' && (typeof b === 'string' || typeof b === 'undefined')) {
    return { bucket: a, key: b };
  }
  // fallback empty
  return { bucket: undefined, key: undefined };
}

/**
 * Normalises bucket/key pairs and tries to infer sensible defaults when humans screw up.
 * - If key missing and bucket looks like a path (contains '/' or ends with known ext), assume the bucket arg was actually the key.
 * - If bucket contains a slash and key exists, split the left-most token as bucket and the rest forms the prefix for the key.
 */
function normalizeBucketKey(bucket, key) {
  const defaultBucket = R2_BUCKETS.RSS_FEEDS || 'rss-feeds';

  // ensure strings (or undefined) only
  bucket = bucket || undefined;
  key = key || undefined;

  // Case: no bucket -> use default bucket, keep key
  if (!bucket) {
    return { bucket: defaultBucket, key };
  }

  // Case: bucket looks like a key (contains '/' or file extension) and key missing
  if (!key && (bucket.includes('/') || /\.[a-z0-9]{2,6}$/i.test(bucket))) {
    info('r2.normalize: inferred bucket/key from single-arg', { original: bucket, inferredBucket: defaultBucket });
    return { bucket: defaultBucket, key: bucket };
  }

  // Case: bucket contains a slash and key provided -> split into bucket and key prefix
  if (bucket.includes('/') && key) {
    const parts = bucket.split('/');
    const maybeBucket = parts.shift();
    if (maybeBucket && !maybeBucket.includes('.')) {
      const rest = parts.join('/');
      const newKey = rest ? `${rest}/${key}` : key;
      info('r2.normalize: split bucket into bucket+prefix', { originalBucket: bucket, bucket: maybeBucket, key: newKey });
      return { bucket: maybeBucket, key: newKey };
    }
  }

  // Looks valid
  return { bucket, key };
}

function ensureBucketKeyOrThrow(bucket, key) {
  if (!bucket || !key) {
    const err = new Error(`Invalid R2 parameters: bucket=${String(bucket)}, key=${String(key)}`);
    error('r2.invalid_params', { bucket, key });
    throw err;
  }
}

/* -------------------------------------------------------------------------- */
/*  Core operations                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Read object as text (utf-8). Accepts object or positional arguments.
 * - getObjectAsText(bucket, key)
 * - getObjectAsText({ bucket, key })
 */
export async function getObjectAsText(a, b) {
  const { bucket: rawBucket, key: rawKey } = parseBucketKeyArgs(a, b);
  const { bucket, key } = normalizeBucketKey(rawBucket, rawKey);
  ensureBucketKeyOrThrow(bucket, key);

  try {
    const cmd = new GetObjectCommand({ Bucket: bucket, Key: key });
    const res = await s3.send(cmd);
    // AWS SDK v3 on node provides a Body stream with transformToString in some runtimes.
    if (res.Body && typeof res.Body.transformToString === 'function') {
      const txt = await res.Body.transformToString('utf-8');
      info('r2.getObjectAsText.success', { bucket, key, length: txt.length });
      return txt;
    }
    // Fallback: stream to buffer
    const chunks = [];
    for await (const chunk of res.Body) chunks.push(Buffer.from(chunk));
    const txt = Buffer.concat(chunks).toString('utf-8');
    info('r2.getObjectAsText.success.stream', { bucket, key, length: txt.length });
    return txt;
  } catch (err) {
    error('r2.getObjectAsText.fail', { bucket, key, error: err.message });
    throw err;
  }
}

/**
 * Read object and parse JSON
 */
export async function getObjectAsJson(a, b) {
  const txt = await getObjectAsText(a, b);
  try {
    return JSON.parse(txt);
  } catch (err) {
    error('r2.getObjectAsJson.fail', { error: err.message });
    throw err;
  }
}

/**
 * Return a readable stream for the object Body.
 * Accepts same arg styles.
 */
export async function getR2ReadStream(a, b) {
  const { bucket: rawBucket, key: rawKey } = parseBucketKeyArgs(a, b);
  const { bucket, key } = normalizeBucketKey(rawBucket, rawKey);
  ensureBucketKeyOrThrow(bucket, key);
  try {
    const cmd = new GetObjectCommand({ Bucket: bucket, Key: key });
    const res = await s3.send(cmd);
    return res.Body;
  } catch (err) {
    error('r2.getR2ReadStream.fail', { bucket, key, error: err.message });
    throw err;
  }
}

/**
 * Upload buffer/string. Supports both forms:
 * - uploadBuffer(bucket, key, data, contentType)
 * - uploadBuffer({ bucket, key, body, contentType })
 *
 * Accepts Buffer or string for body.
 */
export async function uploadBuffer(a, b, c, d) {
  // support either object-arg or positional
  if (a && typeof a === 'object' && (a.bucket || a.key || a.body)) {
    const { bucket: rawBucket, key: rawKey, body, contentType } = a;
    const { bucket, key } = normalizeBucketKey(rawBucket, rawKey);
    ensureBucketKeyOrThrow(bucket, key);
    return _putObject({ bucket, key, body, contentType });
  } else {
    // positional form (bucket, key, data, contentType)
    const { bucket: rawBucket, key: rawKey } = parseBucketKeyArgs(a, b);
    const data = c;
    const contentType = d;
    const { bucket, key } = normalizeBucketKey(rawBucket, rawKey);
    ensureBucketKeyOrThrow(bucket, key);
    return _putObject({ bucket, key, body: data, contentType });
  }
}

/**
 * Lower-level put wrapper used by uploadBuffer/uploadJson/putText
 * Accepts { bucket, key, body, contentType }
 */
async function _putObject({ bucket, key, body, contentType = 'application/octet-stream' }) {
  const bodyBuffer = Buffer.isBuffer(body) ? body : Buffer.from(String(body || ''));
  try {
    const cmd = new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: bodyBuffer,
      ContentType: contentType,
    });
    await s3.send(cmd);
    info('r2.putObject.success', { bucket, key, size: bodyBuffer.length });
    return { success: true };
  } catch (err) {
    error('r2.putObject.fail', { bucket, key, error: err.message });
    throw err;
  }
}

/**
 * Upload JSON (formatted)
 * Accepts either (bucket, key, json) or ({ bucket, key, body: json })
 */
export async function uploadJson(a, b, c) {
  if (a && typeof a === 'object' && (a.bucket || a.key)) {
    const { bucket: rawBucket, key: rawKey, body } = a;
    return uploadBuffer({ bucket: rawBucket, key: rawKey, body: JSON.stringify(body, null, 2), contentType: 'application/json' });
  } else {
    // positional
    const { bucket: rawBucket, key: rawKey } = parseBucketKeyArgs(a, b);
    const json = c;
    return uploadBuffer(rawBucket, rawKey, JSON.stringify(json, null, 2), 'application/json');
  }
}

/* Aliases for older code */
export const putText = async (a, b, c) => {
  // putText(bucket, key, text) or putText({bucket,key,body})
  if (a && typeof a === 'object') {
    const { bucket, key, body } = a;
    return uploadBuffer({ bucket, key, body: String(body), contentType: 'text/plain' });
  }
  return uploadBuffer(a, b, String(c), 'text/plain');
};
export const putJson = uploadJson;

/**
 * List keys under a prefix.
 * Usage:
 *  - listKeys(bucket, prefix)
 *  - listKeys({ bucket, prefix })
 */
export async function listKeys(a, b) {
  const { bucket: rawBucket, prefix: rawPrefix } = (typeof a === 'object' ? a : { bucket: a, prefix: b });
  const { bucket } = normalizeBucketKey(rawBucket, undefined);
  if (!bucket) throw new Error('listKeys requires a bucket');
  try {
    const cmd = new ListObjectsV2Command({ Bucket: bucket, Prefix: rawPrefix || '' });
    const res = await s3.send(cmd);
    const keys = (res.Contents || []).map(o => o.Key);
    info('r2.listKeys.success', { bucket, prefix: rawPrefix || '', count: keys.length });
    return keys;
  } catch (err) {
    error('r2.listKeys.fail', { bucket, prefix: rawPrefix, error: err.message });
    throw err;
  }
}

/**
 * Delete object. Accepts both styles.
 */
export async function deleteObject(a, b) {
  const { bucket: rawBucket, key: rawKey } = parseBucketKeyArgs(a, b);
  const { bucket, key } = normalizeBucketKey(rawBucket, rawKey);
  ensureBucketKeyOrThrow(bucket, key);
  try {
    await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
    info('r2.deleteObject.success', { bucket, key });
    return { success: true };
  } catch (err) {
    error('r2.deleteObject.fail', { bucket, key, error: err.message });
    throw err;
  }
}

/* -------------------------------------------------------------------------- */
/*  Utilities                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Build a public URL for an object, using endpoint pattern if available.
 * This won't magically make objects public; it's a convenience for generating accessible URLs
 * if your R2 is fronted by a public domain or you have a fetchable endpoint.
 */
export function buildPublicUrl({ bucket, key }) {
  // Prefer user-specified public URL pattern
  if (process.env.R2_PUBLIC_URL) {
    return `${process.env.R2_PUBLIC_URL.replace(/\/$/, '')}/${bucket}/${encodeURIComponent(key)}`;
  }
  // Cloudflare R2 example: https://<account-id>.r2.cloudflarestorage.com/<bucket>/<key>
  if (process.env.R2_ACCOUNT_ID && process.env.R2_ENDPOINT && process.env.R2_ENDPOINT.includes('cloudflarestorage')) {
    return `${process.env.R2_ENDPOINT.replace(/\/$/, '')}/${bucket}/${encodeURIComponent(key)}`;
  }
  // Best-effort fallback
  return `r2://${bucket}/${key}`;
}

/* -------------------------------------------------------------------------- */
/*  Exports                                                                    */
/* -------------------------------------------------------------------------- */


export {
  s3,
  getObjectAsText,
  getObjectAsJson,
  getR2ReadStream,
  uploadBuffer,
  uploadJson,
  listKeys,
  deleteObject,
  putText,
  putJson
}
