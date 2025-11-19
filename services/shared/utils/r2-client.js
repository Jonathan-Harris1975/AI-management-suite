// ============================================================
// ☁️ Cloudflare R2 Client — Hardened + Production Ready
// ============================================================
//
// Features:
//   • Centralised R2 access for all services
//   • Bucket + public URL alias maps
//   • Hardened upload with retries, timing + optional verification
//   • Backwards-compatible legacy aliases (putObject, r2Put, etc.)
//   • Safe error reporting with contextual logging
// ============================================================

import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  DeleteObjectCommand,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";
import {info ,warn,debug} from "#logger.js";

// ------------------------------------------------------------
// 🔧 Environment Variables
// ------------------------------------------------------------
const {
  // Core creds
  R2_ACCESS_KEY_ID,
  R2_SECRET_ACCESS_KEY,
  R2_ENDPOINT,
  R2_REGION,

  // Buckets
  R2_BUCKET_PODCAST,
  R2_BUCKET_RAW_TEXT,
  R2_BUCKET_META,
  R2_BUCKET_MERGED,
  R2_BUCKET_ART,
  R2_BUCKET_RSS_FEEDS,            // newsletter feed
  R2_BUCKET_PODCAST_RSS_FEEDS,    // podcast-specific RSS feed
  R2_BUCKET_TRANSCRIPTS,
  R2_BUCKET_CHUNKS,

  // Newly added
  R2_BUCKET_EDITED_AUDIO,

  // Public URLs
  R2_PUBLIC_BASE_URL_PODCAST,
  R2_PUBLIC_BASE_URL_RAW_TEXT,
  R2_PUBLIC_BASE_URL_META,
  R2_PUBLIC_BASE_URL_MERGE,
  R2_PUBLIC_BASE_URL_ART,
  R2_PUBLIC_BASE_URL_RSS,
  R2_PUBLIC_BASE_URL_TRANSCRIPT,
  R2_PUBLIC_BASE_URL_CHUNKS,

  // Newly added
  R2_PUBLIC_BASE_URL_EDITED_AUDIO,

  // Hardening / debug flags
  R2_DEBUG,
  R2_VERIFY_UPLOAD,
  R2_UPLOAD_MAX_RETRIES,
  R2_UPLOAD_RETRY_DELAY_MS,
  R2_UPLOAD_RETRY_BACKOFF,
} = process.env;

const DEBUG_MODE = R2_DEBUG === "true";
const VERIFY_UPLOAD = R2_VERIFY_UPLOAD === "true" || DEBUG_MODE;

const UPLOAD_MAX_RETRIES = Number(R2_UPLOAD_MAX_RETRIES || 3);
const UPLOAD_BASE_DELAY_MS = Number(R2_UPLOAD_RETRY_DELAY_MS || 500);
const UPLOAD_BACKOFF = Number(R2_UPLOAD_RETRY_BACKOFF || 2);

// ------------------------------------------------------------
// 🧠 Initialize Client (R2 requires path-style addressing)
// ------------------------------------------------------------
export const s3 = new S3Client({
  region: R2_REGION || "auto",
  endpoint: R2_ENDPOINT,
  forcePathStyle: true, // ✅ REQUIRED for Cloudflare R2
  credentials: {
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
  },
});

// ------------------------------------------------------------
// 🪣 Bucket Aliases (all services unify on these keys)
// ------------------------------------------------------------
export const R2_BUCKETS = {
  podcast:          R2_BUCKET_PODCAST,
  rawtext:          R2_BUCKET_RAW_TEXT,
  rawText:          R2_BUCKET_RAW_TEXT,
  "raw-text":       R2_BUCKET_RAW_TEXT,
  meta:             R2_BUCKET_META,
  merged:           R2_BUCKET_MERGED,
  art:              R2_BUCKET_ART,

  chunks:           R2_BUCKET_CHUNKS,
  "podcast-chunks": R2_BUCKET_CHUNKS,

  // Newsletter RSS feed
  rss:              R2_BUCKET_RSS_FEEDS,
  "rss-feeds":      R2_BUCKET_RSS_FEEDS,
  rssfeeds:         R2_BUCKET_RSS_FEEDS,

  // Podcast-specific RSS feed
  podcastRss:       R2_BUCKET_PODCAST_RSS_FEEDS,

  // Transcripts
  transcripts:      R2_BUCKET_TRANSCRIPTS,
  transcript:       R2_BUCKET_TRANSCRIPTS,

  // NEW — final edited/mastered audio
  edited:           R2_BUCKET_EDITED_AUDIO,
  editedAudio:      R2_BUCKET_EDITED_AUDIO,
  "edited-audio":   R2_BUCKET_EDITED_AUDIO,
};

// ------------------------------------------------------------
// 🌍 Public URL Aliases
// ------------------------------------------------------------
export const R2_PUBLIC_URLS = {
  podcast:          R2_PUBLIC_BASE_URL_PODCAST,
  rawtext:          R2_PUBLIC_BASE_URL_RAW_TEXT,
  rawText:          R2_PUBLIC_BASE_URL_RAW_TEXT,
  "raw-text":       R2_PUBLIC_BASE_URL_RAW_TEXT,
  meta:             R2_PUBLIC_BASE_URL_META,
  merged:           R2_PUBLIC_BASE_URL_MERGE,
  art:              R2_PUBLIC_BASE_URL_ART,
  rss:              R2_PUBLIC_BASE_URL_RSS,
  transcript:       R2_PUBLIC_BASE_URL_TRANSCRIPT,
  chunks:           R2_PUBLIC_BASE_URL_CHUNKS,
  "podcast-chunks": R2_PUBLIC_BASE_URL_CHUNKS,

  // NEW — edited/mastered audio
  edited:           R2_PUBLIC_BASE_URL_EDITED_AUDIO,
  editedAudio:      R2_PUBLIC_BASE_URL_EDITED_AUDIO,
  "edited-audio":   R2_PUBLIC_BASE_URL_EDITED_AUDIO,
};

// ------------------------------------------------------------
// 🧩 Helpers
// ------------------------------------------------------------
function sleep(ms) {
  return new Promise((res) => setTimeout(res, ms));
}

export function ensureBucketKey(bucketKey) {
  const bucket = R2_BUCKETS[bucketKey];
  if (!bucket) {
    const valid = Object.keys(R2_BUCKETS).join(", ");
    throw new Error(`❌ Unknown R2 bucket key: ${bucketKey} — valid keys: ${valid}`);
  }
  return bucket;
}

function ensureBuffer(data) {
  if (Buffer.isBuffer(data)) return data;
  if (typeof data === "string") return Buffer.from(data, "utf-8");
  if (data instanceof Uint8Array) return Buffer.from(data);
  throw new Error(
    `R2 upload expects Buffer/string/Uint8Array — got: ${Object.prototype.toString.call(
      data
    )}`
  );
}

function getPublicBaseUrl(bucketKey) {
  const base = R2_PUBLIC_URLS[bucketKey];
  if (!base) {
    throw new Error(`❌ No public URL configured for R2 bucket alias '${bucketKey}'`);
  }
  return base.replace(/\/+$/, "");
}

async function verifyUploadedObject(bucket, bucketKey, key, expectedSize, expectedContentType) {
  if (!VERIFY_UPLOAD) return;

  try {
    const head = await s3.send(
      new HeadObjectCommand({
        Bucket: bucket,
        Key: key,
      })
    );

    const actualSize = Number(head.ContentLength || 0);
    const actualType = head.ContentType || "unknown";

    if (actualSize !== expectedSize) {
      warn("r2.verify.size-mismatch", {
        bucket,
        bucketKey,
        key,
        expectedSize,
        actualSize,
      });
    }

    if (expectedContentType && actualType !== expectedContentType) {
      warn("r2.verify.content-type-mismatch", {
        bucket,
        bucketKey,
        key,
        expectedContentType,
        actualType,
      });
    }

    if (DEBUG_MODE) {
      debug ("r2.verify.success", {
        bucket,
        bucketKey,
        key,
        size: actualSize,
        contentType: actualType,
      });
    }
  } catch (err) {
    warn("r2.verify.failed", {
      bucket,
      bucketKey,
      key,
      error: err.message,
    });
  }
}

// ------------------------------------------------------------
// ⚙️ Upload / Download
// ------------------------------------------------------------
export async function uploadBuffer(
  bucketKey,
  key,
  buffer,
  contentType = "application/octet-stream"
) {
  const bucket = ensureBucketKey(bucketKey);
  const body = ensureBuffer(buffer);
  const size = body.length;

  const base = getPublicBaseUrl(bucketKey);

  const startedAt = Date.now();
  let lastError = null;

  for (let attempt = 1; attempt <= UPLOAD_MAX_RETRIES; attempt++) {
    try {
      if (DEBUG_MODE) {
        log.info("r2.upload.start", {
          bucket,
          bucketKey,
          key,
          size,
          contentType,
          attempt,
          maxAttempts: UPLOAD_MAX_RETRIES,
        });
      }

      await s3.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: body,
          ContentType: contentType,
          ContentLength: size,
        })
      );

      const durationMs = Date.now() - startedAt;

      info("r2.upload.success", {
        bucket,
        bucketKey,
        key,
        size,
        contentType,
        attempts: attempt,
        durationMs,
      });

      // Optional integrity verification (HEAD)
      await verifyUploadedObject(bucket, bucketKey, key, size, contentType);

      const url = `${base}/${encodeURIComponent(key)}`;
      return url;
    } catch (err) {
      lastError = err;

      const durationMs = Date.now() - startedAt;

      warn("r2.upload.retry", {
        bucket,
        bucketKey,
        key,
        size,
        contentType,
        attempt,
        maxAttempts: UPLOAD_MAX_RETRIES,
        durationMs,
        error: err.message,
      });

      if (attempt >= UPLOAD_MAX_RETRIES) {
        break;
      }

      const delay =
        UPLOAD_BASE_DELAY_MS * Math.pow(UPLOAD_BACKOFF, attempt - 1);

      if (DEBUG_MODE) {
        log.info("r2.upload.wait-before-retry", {
          bucket,
          bucketKey,
          key,
          delayMs: delay,
          nextAttempt: attempt + 1,
        });
      }

      await sleep(delay);
    }
  }

  error("r2.upload.failed", {
    bucket,
    bucketKey,
    key,
    size,
    contentType,
    maxAttempts: UPLOAD_MAX_RETRIES,
    error: lastError ? lastError.message : "Unknown error",
  });

  throw new Error(
    `R2 upload failed for ${bucketKey}/${key} after ${UPLOAD_MAX_RETRIES} attempts: ${
      lastError?.message || "Unknown error"
    }`
  );
}

export async function uploadText(
  bucketKey,
  key,
  text,
  contentType = "text/plain"
) {
  return uploadBuffer(bucketKey, key, Buffer.from(text, "utf-8"), contentType);
}

export async function getObjectAsText(bucketKey, key) {
  const bucket = ensureBucketKey(bucketKey);
  const response = await s3.send(
    new GetObjectCommand({ Bucket: bucket, Key: key })
  );

  const chunks = [];
  for await (const chunk of response.Body) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf-8");
}

// ------------------------------------------------------------
// 🔁 Legacy Aliases (backwards compatible)
// ------------------------------------------------------------
export const putObject = uploadBuffer;
export const r2Put = uploadBuffer;
export const putText = uploadText;
export const getObject = getObjectAsText;
export const r2Get = getObjectAsText;

export const putJson = async (bucketKey, key, obj) =>
  uploadText(bucketKey, key, JSON.stringify(obj, null, 2), "application/json");

// URL builder (legacy use)
export function buildPublicUrl(bucketKey, key) {
  const base = getPublicBaseUrl(bucketKey);
  return `${base}/${encodeURIComponent(key)}`;
}

// ------------------------------------------------------------
// 🧰 Utilities
// ------------------------------------------------------------
export async function listKeys(bucketKey, prefix = "") {
  const bucket = ensureBucketKey(bucketKey);
  const { Contents } = await s3.send(
    new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix })
  );
  return Contents ? Contents.map((c) => c.Key) : [];
}

export async function deleteObject(bucketKey, key) {
  const bucket = ensureBucketKey(bucketKey);
  await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
  log.info("🗑️ R2 object deleted", { bucket, key });
}

// ------------------------------------------------------------
// 🧾 Startup Log
// ------------------------------------------------------------
info("r2-client.initialized", {
  endpoint: R2_ENDPOINT,
  region: R2_REGION || "auto",
  debug: DEBUG_MODE,
  verifyUpload: VERIFY_UPLOAD,
  uploadMaxRetries: UPLOAD_MAX_RETRIES,
  bucketsConfigured: Object.entries(R2_BUCKETS).reduce(
    (acc, [alias, value]) => {
      acc[alias] = Boolean(value);
      return acc;
    },
    {}
  ),
});

// ------------------------------------------------------------
// 📦 Default Export
// ------------------------------------------------------------
export default {
  s3,
  R2_BUCKETS,
  R2_PUBLIC_URLS,
  uploadBuffer,
  uploadText,
  getObjectAsText,
  deleteObject,
  listKeys,
  putObject,
  putJson,
  putText,
  buildPublicUrl,
  getObject,
  r2Put,
  r2Get,
};
