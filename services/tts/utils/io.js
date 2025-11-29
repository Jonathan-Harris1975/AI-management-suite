// services/tts/utils/io.js
// Unified I/O helpers for TTS audio pipeline – central R2 + logger

import { putObject, putJson } from "#shared/r2-client.js";
import { info, error } from "#logger.js";

// Environment variables (required)
const RAW_BUCKET     = process.env.R2_BUCKET_RAW;       // podcast-chunks
const MERGED_BUCKET  = process.env.R2_BUCKET_MERGED;    // podcast-merged
const META_BUCKET    = process.env.R2_BUCKET_META;      // podcast-meta
const PODCAST_BUCKET = process.env.R2_BUCKET_PODCAST;   // podcast
const PUBLIC_BASE    = process.env.R2_PUBLIC_BASE_URL_PODCAST; // base URL for public access

function requireEnv(name, val) {
  if (!val) throw new Error(`Missing required env: ${name}`);
  return val;
}

/**
 * Save a TTS chunk (MP3) to R2.
 * @param {Buffer|Uint8Array} audioBuffer - MP3 bytes
 * @param {string} key - e.g. "chunks/session123/part1.mp3"
 */
export async function saveTtsChunk(audioBuffer, key) {
  requireEnv("R2_BUCKET_RAW", RAW_BUCKET);
  await putObject(RAW_BUCKET, key, audioBuffer, "audio/mpeg");
  info("tts.chunk.put", { bucket: RAW_BUCKET, key, bytes: audioBuffer.length });
}

/**
 * Save merged TTS file to R2 (final output).
 * @param {Buffer|Uint8Array} audioBuffer - final merged MP3 bytes
 * @param {string} key - e.g. "episodes/session123/merged.mp3"
 */
export async function saveMergedTts(audioBuffer, key) {
  requireEnv("R2_BUCKET_MERGED", MERGED_BUCKET);
  await putObject(MERGED_BUCKET, key, audioBuffer, "audio/mpeg");
  info("tts.merged.put", { bucket: MERGED_BUCKET, key, bytes: audioBuffer.length });
}

/**
 * Save metadata (JSON transcript, timestamps, etc.)
 * @param {string} key - e.g. "episodes/session123/meta.json"
 * @param {object} data
 */
export async function saveTtsMeta(key, data) {
  requireEnv("R2_BUCKET_META", META_BUCKET);
  await putJson(META_BUCKET, key, data);
  info("tts.meta.put", { bucket: META_BUCKET, key });
}

/**
 * Publish final MP3 to public bucket and return its URL.
 * @param {Buffer|Uint8Array} audioBuffer
 * @param {string} key - e.g. "episodes/session123/final.mp3"
 */
export async function publishFinalTts(audioBuffer, key) {
  requireEnv("R2_BUCKET_PODCAST", PODCAST_BUCKET);
  requireEnv("R2_PUBLIC_BASE_URL_PODCAST", PUBLIC_BASE);

  await putObject(PODCAST_BUCKET, key, audioBuffer, "audio/mpeg");
  info("tts.publish.put", { bucket: PODCAST_BUCKET, key, bytes: audioBuffer.length });

  const publicUrl = `${PUBLIC_BASE.replace(/\/+$/, "")}/${key.replace(/^\/+/, "")}`;
  info("tts.publish.url", { url: publicUrl });

  return publicUrl;
}
