// ============================================================
// 🎛️ mergeProcessor — Robust ffmpeg concat with Retries
// ============================================================
// - Accepts TTS results (objects) or direct URL strings
// - Normalizes inputs to safe URLs
// - Uses concat demuxer via stdin file list
// - Retries with backoff; returns { key, url, bytes }
// - Uses ffmpeg-static for portability
// ============================================================

import { info, warn, error } from "#logger.js";
import { putObject } from "#shared/r2-client.js";
import { startKeepAlive, stopKeepAlive } from "../../shared/utils/keepalive.js";
import { spawn } from "node:child_process";
import ffmpegPath from "ffmpeg-static";

// ✅ Support both default and named export from retry.js
import * as retryModule from "../../../utils/retry.js";
const withRetries = retryModule.withRetries || retryModule.default;

// ---- Env
const MERGED_BUCKET = process.env.R2_BUCKET_MERGED || "podcast-merged";
const PUBLIC_BASE_URL_MERGED =
  process.env.R2_PUBLIC_BASE_URL_MERGED ||
  process.env.R2_PUBLIC_BASE_URL_PODCAST; // fallback for older setups

const PUBLIC_BASE_URL_CHUNKS = process.env.R2_PUBLIC_BASE_URL_CHUNKS; // required for {key} → URL

function requireEnv(name, val) {
  if (!val) throw new Error(`Missing required env: ${name}`);
}
requireEnv("R2_BUCKET_MERGED", MERGED_BUCKET);
requireEnv("R2_PUBLIC_BASE_URL_MERGED", PUBLIC_BASE_URL_MERGED);
requireEnv("R2_PUBLIC_BASE_URL_CHUNKS", PUBLIC_BASE_URL_CHUNKS);

// ---- Helpers
const trimRightSlashes = (s) => String(s).replace(/\/+$/, "");
const trimLeftSlashes  = (s) => String(s).replace(/^\/+/, "");
const joinUrl = (base, key) =>
  `${trimRightSlashes(base)}/${trimLeftSlashes(key)}`;

/**
 * Normalize input list into an array of string URLs.
 * Accepts:
 *   - "https://..." (string)
 *   - { url: "https://..." }
 *   - { key: "TT-.../audio-001.mp3" }  // will use R2_PUBLIC_BASE_URL_CHUNKS
 */
function normalizeUrls(items) {
  if (!Array.isArray(items)) {
    throw new Error("mergeProcessor: urls input must be an array");
  }

  const clean = items
    .map((item, idx) => {
      // Direct string URL
      if (typeof item === "string") return item;

      // Object with .url
      if (item && typeof item.url === "string" && item.url.length > 0) {
        return item.url;
      }

      // Object with .key
      if (item && typeof item.key === "string" && item.key.length > 0) {
        return joinUrl(PUBLIC_BASE_URL_CHUNKS, item.key);
      }

      // Some callers may use Location or path
      if (item && typeof item.Location === "string" && item.Location.length > 0) {
        return item.Location;
      }

      // If it has a buffer-only success result, skip it
      if (item && item.success && !item.url && !item.key) {
        warn({ idx }, "mergeProcessor: skipping non-addressable item");
        return null;
      }

      // Unknown shape
      warn({ idx, itemType: typeof item }, "mergeProcessor: invalid item; skipping");
      return null;
    })
    .filter(Boolean)
    .map(String)
    .map((u) => u.trim())
    .filter((u) => u.length > 0);

  if (clean.length === 0) {
    throw new Error("mergeProcessor: no valid URLs to merge");
  }
  return clean;
}

/**
 * ffmpeg concat demuxer expects lines like:
 *   file 'URL'
 * We escape single quotes safely.
 */
function buildListStdin(urls) {
  return urls
    .map((u) => `file '${String(u).replace(/'/g, "'\\''")}'`)
    .join("\n");
}

async function runFfmpegConcat(urls) {
  return new Promise((resolve, reject) => {
    const args = [
      "-hide_banner",
      "-loglevel", "error",
      "-f", "concat",
      "-safe", "0",
      "-protocol_whitelist", "file,pipe,concat,crypto,data,http,https,tcp,tls",
      "-i", "pipe:0",
      "-c", "copy",
      "-f", "mp3",
      "pipe:1",
    ];

    const ff = spawn(ffmpegPath, args, { stdio: ["pipe", "pipe", "pipe"] });

    const chunks = [];
    let stderr = "";

    ff.stdout.on("data", (d) => chunks.push(d));
    ff.stderr.on("data", (d) => { stderr += d.toString(); });

    ff.on("error", (e) => reject(e));
    ff.on("close", (code) => {
      if (code === 0) return resolve(Buffer.concat(chunks));
      const err = new Error(stderr || `ffmpeg exited with code ${code}`);
      reject(err);
    });

    const listText = buildListStdin(urls);
    ff.stdin.write(listText);
    ff.stdin.end();
  });
}

/**
 * Merge TTS chunk results or URLs into a single MP3.
 * @param {string} sessionId
 * @param {Array<string|{url?:string,key?:string}>} inputs
 * @param {string=} outputKeyOptional
 * @returns {Promise<{ key: string, url: string, bytes: number }>}
 */
export async function mergeProcessor(sessionId, inputs, outputKeyOptional) {
  const keepAliveId = `mergeProcessor:${sessionId}`;
  const keepAlive = startKeepAlive(
    keepAliveId,
    15_000,
    "🌙 Silent keep-alive active for mergeProcessor"
  );

  try {
    info("🎛️ Launching ffmpeg concat");

    if (typeof withRetries !== "function") {
      throw new Error("mergeProcessor: withRetries is not a function");
    }

    // Normalize to string URLs
    const urls = normalizeUrls(inputs);
    info({ count: urls.length }, "🎯 Merge URL list prepared");

    // Build default output key if not provided
    const outputKey =
      (typeof outputKeyOptional === "string" && outputKeyOptional.trim()) ||
      `${sessionId}/merged.mp3`;

    const mergedBuffer = await withRetries(
      () => runFfmpegConcat(urls),
      { retries: 3, delay: 2500, label: "ffmpeg:concat" }
    );

    info("📤 Uploading merged output to R2", { bucket: MERGED_BUCKET, key: outputKey });
    await putObject(MERGED_BUCKET, outputKey, mergedBuffer, { "Content-Type": "audio/mpeg" });

    const publicUrl = joinUrl(PUBLIC_BASE_URL_MERGED, outputKey);
    info("✅ Merge complete", { sessionId, publicUrl });

    return { key: outputKey, url: publicUrl, bytes: mergedBuffer.length };

  } catch (err) {
    error("💥 Streamed mergeProcessor failed", { service: "ai-podcast-suite", err: err.message });
    throw err;
  } finally {
    stopKeepAlive(keepAlive);
    info("🌙 Keep-alive stopped.", { service: "ai-podcast-suite" });
  }
}

export default { mergeProcessor };
