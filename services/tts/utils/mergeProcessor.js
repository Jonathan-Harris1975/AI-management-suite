// ============================================================
// 🎛️ mergeProcessor — Robust ffmpeg concat with Retries
// ============================================================
// - Uses concat demuxer via stdin file list (avoids multiple pipes)
// - Retries on ECONNRESET/stream errors with backoff
// - Clean keep-alive lifecycle
// - Uses ffmpeg-static binary for full portability
// ============================================================

import { info, warn, error } from "#logger.js";
import { putObject } from "#shared/r2-client.js";
import { startKeepAlive, stopKeepAlive } from "../../shared/utils/keepalive.js";
import { spawn } from "node:child_process";
import ffmpegPath from "ffmpeg-static";

// ✅ Support both default and named export from retry.js
import * as retryModule from "../../../utils/retry.js";
const withRetries = retryModule.withRetries || retryModule.default;

const MERGED_BUCKET = process.env.R2_BUCKET_MERGED || "podcast-merged";
const PUBLIC_BASE_URL_MERGED =
  process.env.R2_PUBLIC_BASE_URL_MERGED ||
  process.env.R2_PUBLIC_BASE_URL_PODCAST;

function requireEnv(name, val) {
  if (!val) throw new Error(`Missing required env: ${name}`);
}
requireEnv("R2_BUCKET_MERGED", MERGED_BUCKET);
requireEnv("R2_PUBLIC_BASE_URL_MERGED", PUBLIC_BASE_URL_MERGED);

function buildListStdin(urls) {
  // ffmpeg concat demuxer expects lines: file 'URL' — allow remote with -safe 0
  return urls.map(u => `file '${u.replace(/'/g, "'\\\\''")}'`).join("\n");
}

async function runFfmpegConcat(urls) {
  return new Promise((resolve, reject) => {
    const args = [
      "-hide_banner",
      "-loglevel", "error",
      "-f", "concat",
      "-safe", "0",
      "-protocol_whitelist", "file,http,https,tcp,tls",
      "-i", "pipe:0",
      "-c", "copy",
      "-movflags", "faststart",
      "-f", "mp3",
      "pipe:1"
    ];

    // ✅ Use ffmpeg-static absolute path
    const ff = spawn(ffmpegPath, args, { stdio: ["pipe", "pipe", "pipe"] });

    let chunks = [];
    let stderr = "";

    ff.stdout.on("data", d => chunks.push(d));
    ff.stderr.on("data", d => { stderr += d.toString(); });

    ff.on("error", e => reject(e));
    ff.on("close", code => {
      if (code === 0) return resolve(Buffer.concat(chunks));
      const err = new Error(stderr || `ffmpeg exited with code ${code}`);
      reject(err);
    });

    // Write the file list to stdin then close
    const listText = buildListStdin(urls);
    ff.stdin.write(listText);
    ff.stdin.end();
  });
}

export async function mergeProcessor(sessionId, urls, outputKey) {
  const keepAliveId = `mergeProcessor:${sessionId}`;
  const keepAlive = startKeepAlive(keepAliveId, 15_000, "🌙 Silent keep-alive active for mergeProcessor");

  try {
    info("🎛️ Launching ffmpeg concat");

    // 🌀 Ensure retry wrapper is valid
    if (typeof withRetries !== "function") {
      throw new Error("Retry utility 'withRetries' is not a valid function export");
    }

    // 🌀 Run with retries (3x backoff)
    const mergedBuffer = await withRetries(
      () => runFfmpegConcat(urls),
      { retries: 3, delay: 2500, label: "ffmpeg:concat" }
    );

    info("📤 Uploading merged output to R2", { bucket: MERGED_BUCKET });
    await putObject(MERGED_BUCKET, outputKey, mergedBuffer, {
      "Content-Type": "audio/mpeg"
    });

    const publicUrl = `${PUBLIC_BASE_URL_MERGED}/${outputKey}`;
    info("✅ Merge complete", { sessionId, publicUrl });
    return publicUrl;

  } catch (err) {
    error("💥 Streamed mergeProcessor failed", { service: "ai-podcast-suite", err: err.message });
    throw err;
  } finally {
    stopKeepAlive(keepAlive);
    info("🌙 Keep-alive stopped.", { service: "ai-podcast-suite" });
  }
}
