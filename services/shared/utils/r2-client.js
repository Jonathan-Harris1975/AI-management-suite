// r2-client.js — minimal logging, root-logger wired
import log from "../../../utils/root-logger.js";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";

const {
  R2_ACCESS_KEY_ID,
  R2_SECRET_ACCESS_KEY,
  R2_ENDPOINT,
  R2_REGION,
  R2_BUCKET_PODCAST,
  R2_BUCKET_RAW_TEXT,
  R2_BUCKET_META,
  R2_BUCKET_MERGED,
  R2_BUCKET_ART,
  R2_BUCKET_RSS_FEEDS,
  R2_BUCKET_PODCAST_RSS_FEEDS,
  R2_BUCKET_TRANSCRIPTS,
  R2_BUCKET_CHUNKS,
  R2_BUCKET_EDITED_AUDIO,
  R2_PUBLIC_BASE_URL_PODCAST,
  R2_PUBLIC_BASE_URL_RAW_TEXT,
  R2_PUBLIC_BASE_URL_META,
  R2_PUBLIC_BASE_URL_MERGE,
  R2_PUBLIC_BASE_URL_ART,
  R2_PUBLIC_BASE_URL_RSS,
  R2_PUBLIC_BASE_URL_TRANSCRIPT,
  R2_PUBLIC_BASE_URL_CHUNKS,
  R2_PUBLIC_BASE_URL_EDITED_AUDIO,
} = process.env;

export const s3 = new S3Client({
  region: R2_REGION || "auto",
  endpoint: R2_ENDPOINT,
  forcePathStyle: true,
  credentials: {
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
  },
});

export const R2_BUCKETS = {
  podcast: R2_BUCKET_PODCAST,
  rawtext: R2_BUCKET_RAW_TEXT,
  rawText: R2_BUCKET_RAW_TEXT,
  "raw-text": R2_BUCKET_RAW_TEXT,
  meta: R2_BUCKET_META,
  merged: R2_BUCKET_MERGED,
  art: R2_BUCKET_ART,
  chunks: R2_BUCKET_CHUNKS,
  "podcast-chunks": R2_BUCKET_CHUNKS,
  rss: R2_BUCKET_RSS_FEEDS,
  "rss-feeds": R2_BUCKET_RSS_FEEDS,
  rssfeeds: R2_BUCKET_RSS_FEEDS,
  podcastRss: R2_BUCKET_PODCAST_RSS_FEEDS,
  transcripts: R2_BUCKET_TRANSCRIPTS,
  transcript: R2_BUCKET_TRANSCRIPTS,
  edited: R2_BUCKET_EDITED_AUDIO,
  editedAudio: R2_BUCKET_EDITED_AUDIO,
  "edited-audio": R2_BUCKET_EDITED_AUDIO,
};

export const R2_PUBLIC_URLS = {
  podcast: R2_PUBLIC_BASE_URL_PODCAST,
  rawtext: R2_PUBLIC_BASE_URL_RAW_TEXT,
  rawText: R2_PUBLIC_BASE_URL_RAW_TEXT,
  "raw-text": R2_PUBLIC_BASE_URL_RAW_TEXT,
  meta: R2_PUBLIC_BASE_URL_META,
  merged: R2_PUBLIC_BASE_URL_MERGE,
  art: R2_PUBLIC_BASE_URL_ART,
  rss: R2_PUBLIC_BASE_URL_RSS,
  transcript: R2_PUBLIC_BASE_URL_TRANSCRIPT,
  chunks: R2_PUBLIC_BASE_URL_CHUNKS,
  "podcast-chunks": R2_PUBLIC_BASE_URL_CHUNKS,
  edited: R2_PUBLIC_BASE_URL_EDITED_AUDIO,
  editedAudio: R2_PUBLIC_BASE_URL_EDITED_AUDIO,
  "edited-audio": R2_PUBLIC_BASE_URL_EDITED_AUDIO,
};

export function ensureBucketKey(bucketKey) {
  const bucket = R2_BUCKETS[bucketKey];
  if (!bucket) {
    throw new Error(`Invalid bucketKey: ${bucketKey}`);
  }
  return bucket;
}

export function buildPublicUrl(bucketKey, key) {
  const base = R2_PUBLIC_URLS[bucketKey];
  if (!base) {
    throw new Error(`No public URL configured for bucketKey: ${bucketKey}`);
  }
  return `${base.replace(/\/+$/, "")}/${encodeURIComponent(key)}`;
}

export async function uploadBuffer(bucketKey, key, buffer) {
  const bucket = ensureBucketKey(bucketKey);
  try {
    await s3.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: buffer,
      }),
    );
  } catch (err) {
    log.error("r2.upload.failed", { bucketKey, key });
    throw err;
  }
}

export async function uploadText(bucketKey, key, text) {
  return uploadBuffer(bucketKey, key, Buffer.from(text, "utf-8"));
}

export async function getObjectAsText(bucketKey, key) {
  const bucket = ensureBucketKey(bucketKey);
  const res = await s3.send(
    new GetObjectCommand({ Bucket: bucket, Key: key }),
  );
  const chunks = [];
  for await (const chunk of res.Body) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf-8");
}

export async function listKeys(bucketKey, prefix = "") {
  const bucket = ensureBucketKey(bucketKey);
  const { Contents } = await s3.send(
    new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix }),
  );
  return Contents ? Contents.map((c) => c.Key) : [];
}

export async function deleteObject(bucketKey, key) {
  const bucket = ensureBucketKey(bucketKey);
  await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
}

// Minimal startup log
log.info("r2.client.ready", { endpoint: R2_ENDPOINT, region: R2_REGION || "auto" });

export default {
  s3,
  R2_BUCKETS,
  R2_PUBLIC_URLS,
  ensureBucketKey,
  buildPublicUrl,
  uploadBuffer,
  uploadText,
  getObjectAsText,
  listKeys,
  deleteObject,
  putJson,
  
};
