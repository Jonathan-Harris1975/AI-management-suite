// ============================================================
// 🎛️ mergeProcessor — Robust ffmpeg concat with Retries
// ============================================================
// - Uses concat demuxer via stdin file list (avoids multiple pipes)
// - Retries on ECONNRESET/stream errors with backoff
// - Clean keep-alive lifecycle
// ============================================================

import { info, warn, error } from "#logger.js";
import { putObject } from "#shared/r2-client.js";
import { startKeepAlive, stopKeepAlive } from "../../shared/utils/keepalive.js";
import { spawn } from "node:child_process";
import { withRetries } from "../../../utils/retry.js";

const MERGED_BUCKET = process.env.R2_BUCKET_MERGED || "podcast-merged";
const PUBLIC_BASE_URL_MERGED = process.env.R2_PUBLIC_BASE_URL_MERGED || process.env.R2_PUBLIC_BASE_URL_PODCAST;

function requireEnv(name, val) {
  if (!val) throw new Error(`Missing required env: ${name}`);
}
requireEnv("R2_BUCKET_MERGED", MERGED_BUCKET);
requireEnv("R2_PUBLIC_BASE_URL_MERGED", PUBLIC_BASE_URL_MERGED);

function buildListStdin(urls) {
  // ffmpeg concat demuxer expects lines: file 'URL' — allow remote with -safe 0
  return urls.map(u => `file '${u.replace(/'/g, "'\\''")}'`).join("\n");
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

    const ff = spawn("ffmpeg", args, { stdio: ["pipe", "pipe", "pipe"] });

    let chunks = [];
    let stderr = "";
    ff.stdout.on("data", (d) => chunks.push(d));
    ff.stderr.on("data", (d) => { stderr += d.toString(); });

    ff.on("error", (e) => reject(e));
    ff.on("close", (code) => {
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

export async function mergeProcessor(sessionId, chunkResultsOrUrls) {
  const label = `mergeProcessor:${sessionId}`;
  startKeepAlive(label, 15000);
  try {
    // Accept array of {url} or string URLs
    const urls = (chunkResultsOrUrls || [])
      .map((x) => (typeof x === "string" ? x : x?.url))
      .filter(Boolean);

    if (!urls.length) throw new Error("mergeProcessor received empty URL list");
    info({ sessionId, count: urls.length }, "🎛️ Launching ffmpeg concat");

    const mergedBuffer = await withRetries("ffmpeg:concat", () => runFfmpegConcat(urls), 3, 3000);

    const key = `${sessionId}/merged.mp3`;
    await putObject("merged", key, mergedBuffer, "audio/mpeg");
    const publicUrl = `${PUBLIC_BASE_URL_MERGED}/${encodeURIComponent(key)}`;
    info({ sessionId, size: mergedBuffer.length, publicUrl }, "💾 Streamed merge uploaded to R2");

    return { key, url: publicUrl, count: urls.length };
  } catch (err) {
    error({ sessionId, err: err?.message || String(err) }, "💥 Streamed mergeProcessor failed");
    throw err;
  } finally {
    stopKeepAlive(label);
  }
}

export default { mergeProcessor };
