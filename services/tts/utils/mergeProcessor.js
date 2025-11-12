// ============================================================
// 🎛️ mergeProcessor — Reliable ffmpeg concat with Retries
// ============================================================
// - Accepts { url } | { key } | direct strings
// - Validates ffmpeg binary before spawn
// - Falls back to system ffmpeg / installer if static binary fails
// - Returns { key, url, bytes } or throws descriptive error
// ============================================================

import { info, warn, error } from "#logger.js";
import { putObject } from "#shared/r2-client.js";
import { startKeepAlive, stopKeepAlive } from "../../shared/utils/keepalive.js";
import { spawn } from "node:child_process";
import fs from "node:fs";
import ffmpegStatic from "ffmpeg-static";
import * as retryModule from "../../../utils/retry.js";

const withRetries = retryModule.withRetries || retryModule.default;

const MERGED_BUCKET = process.env.R2_BUCKET_MERGED || "podcast-merged";
const PUBLIC_BASE_URL_MERGED =
  process.env.R2_PUBLIC_BASE_URL_MERGED || process.env.R2_PUBLIC_BASE_URL_PODCAST;
const PUBLIC_BASE_URL_CHUNKS = process.env.R2_PUBLIC_BASE_URL_CHUNKS;

function requireEnv(name, val) {
  if (!val) throw new Error(`Missing required env: ${name}`);
}
requireEnv("R2_BUCKET_MERGED", MERGED_BUCKET);
requireEnv("R2_PUBLIC_BASE_URL_MERGED", PUBLIC_BASE_URL_MERGED);
requireEnv("R2_PUBLIC_BASE_URL_CHUNKS", PUBLIC_BASE_URL_CHUNKS);

const trimRight = (s) => String(s).replace(/\/+$/, "");
const trimLeft = (s) => String(s).replace(/^\/+/, "");
const joinUrl = (a, b) => `${trimRight(a)}/${trimLeft(b)}`;

function normalizeUrls(items) {
  if (!Array.isArray(items)) throw new Error("mergeProcessor: input must be array");
  const out = items
    .map((x) => {
      if (typeof x === "string") return x;
      if (x?.url) return x.url;
      if (x?.key) return joinUrl(PUBLIC_BASE_URL_CHUNKS, x.key);
      return null;
    })
    .filter(Boolean)
    .map(String);
  if (out.length === 0) throw new Error("mergeProcessor: no valid URLs to merge");
  return out;
}

function buildListStdin(urls) {
  return urls.map((u) => `file '${u.replace(/'/g, "'\\''")}'`).join("\n");
}

// ------------------------------------------------------------
// 🧩 Robust ffmpeg spawn with fallbacks
// ------------------------------------------------------------
async function findFfmpeg() {
  // Try ffmpeg-static first
  try {
    if (ffmpegStatic && fs.existsSync(ffmpegStatic)) {
      fs.accessSync(ffmpegStatic, fs.constants.X_OK);
      info("Using ffmpeg-static binary");
      return ffmpegStatic;
    }
  } catch (err) {
    warn(`mergeProcessor: ffmpeg-static not executable: ${err.message}`);
  }

  // Try @ffmpeg-installer/ffmpeg
  try {
    const ffmpegInstaller = await import("@ffmpeg-installer/ffmpeg");
    const installerPath = ffmpegInstaller.path;
    if (installerPath && fs.existsSync(installerPath)) {
      fs.accessSync(installerPath, fs.constants.X_OK);
      info("Using @ffmpeg-installer/ffmpeg binary");
      return installerPath;
    }
  } catch (err) {
    warn(`mergeProcessor: @ffmpeg-installer/ffmpeg not available: ${err.message}`);
  }

  // System fallback
  info("Falling back to system ffmpeg");
  return "ffmpeg";
}

async function runFfmpegConcat(urls) {
  const ffmpegPath = await findFfmpeg();
  
  return new Promise((resolve, reject) => {
    const args = [
      "-hide_banner",
      "-loglevel", "error",
      "-f", "concat",
      "-safe", "0",
      "-protocol_whitelist", "file,http,https,tcp,tls,pipe,crypto",
      "-i", "pipe:0",
      "-c", "copy",
      "-movflags", "faststart",
      "-f", "mp3",
      "pipe:1"
    ];

    const ff = spawn(ffmpegPath, args, { stdio: ["pipe", "pipe", "pipe"] });
    const stdoutChunks = [];
    let stderrLog = "";

    ff.stdout.on("data", (d) => stdoutChunks.push(d));
    
    ff.stderr.on("data", (d) => {
      const msg = d.toString();
      stderrLog += msg;
      // Log errors in real-time for debugging
      if (msg.toLowerCase().includes("error")) {
        error(`ffmpeg stderr: ${msg.trim()}`);
      }
    });

    ff.on("error", (err) => {
      error(`ffmpeg spawn error: ${err.message}`);
      reject(new Error(`ffmpeg spawn failed: ${err.message}`));
    });

    ff.on("close", (code) => {
      if (code === 0) {
        const merged = Buffer.concat(stdoutChunks);
        if (merged.length === 0) {
          return reject(new Error("ffmpeg produced empty output"));
        }
        return resolve(merged);
      }
      const reason = stderrLog.trim() || `ffmpeg exited with code ${code}`;
      error(`ffmpeg failed: ${reason}`);
      reject(new Error(reason));
    });

    try {
      const listText = buildListStdin(urls);
      ff.stdin.write(listText);
      ff.stdin.end();
    } catch (err) {
      error(`Failed to write to ffmpeg stdin: ${err.message}`);
      reject(new Error(`Failed to send URL list to ffmpeg: ${err.message}`));
    }
  });
}

// ------------------------------------------------------------
// 🚀 mergeProcessor main
// ------------------------------------------------------------
export async function mergeProcessor(sessionId, inputs, outputKeyOpt) {
  const keepAliveId = `mergeProcessor:${sessionId}`;
  const keepAlive = startKeepAlive(keepAliveId, 15_000, " ⏳Silent keep-alive active for mergeProcessor");

  try {
    info("🎛️ Launching ffmpeg concat");

    const urls = normalizeUrls(inputs);
    info({ count: urls.length }, "🎯 Merge URL list prepared");

    const outputKey = outputKeyOpt || `${sessionId}/merged.mp3`;

    const mergedBuffer = await withRetries(
      () => runFfmpegConcat(urls),
      { retries: 3, delay: 2500, label: "ffmpeg:concat" }
    );

    if (!mergedBuffer || mergedBuffer.length === 0) {
      throw new Error("Merge produced empty buffer");
    }

    await putObject(MERGED_BUCKET, outputKey, mergedBuffer, { "Content-Type": "audio/mpeg" });

    const publicUrl = joinUrl(PUBLIC_BASE_URL_MERGED, outputKey);
    info("✅ Merge complete", { sessionId, publicUrl, bytes: mergedBuffer.length });
    
    return { key: outputKey, url: publicUrl, bytes: mergedBuffer.length };

  } catch (err) {
    error("💥 Streamed mergeProcessor failed", {
      service: "ai-podcast-suite",
      sessionId,
      err: err.message || err
    });
    throw err;
  } finally {
    stopKeepAlive(keepAlive);
    info("⏳Keep-alive stopped.", { service: "ai-podcast-suite", sessionId });
  }
}

export default { mergeProcessor };
