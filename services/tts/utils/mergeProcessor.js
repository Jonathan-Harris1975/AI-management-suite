// ============================================================
// 🎛️ mergeProcessor — Reliable ffmpeg concat with low-memory streaming
// ============================================================
// - Accepts { url } | { key } | direct strings
// - Resolves ffmpeg binary (ffmpeg-static -> @ffmpeg-installer/ffmpeg -> system)
// - Streams output to a temp file to avoid OOM (Render 512–1024 MB dynos)
// - Uploads to R2 using a Readable stream (no in-memory Buffer)
// - Retries on transient failures with clear error messages
// ============================================================

import { info, warn, error } from "#logger.js";
import { putObject } from "#shared/r2-client.js";
import { startKeepAlive, stopKeepAlive } from "../../shared/utils/keepalive.js";
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
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
// 🧩 Robust ffmpeg finder with fallbacks
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

// ------------------------------------------------------------
// 🧵 Low-memory concat: write stdout to a temp file
// ------------------------------------------------------------
async function runFfmpegConcatToFile(urls) {
  const ffmpegPath = await findFfmpeg();
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "merge-"));
  const outPath = path.join(tmpDir, "merged.mp3");

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
      outPath,
    ];

    const ff = spawn(ffmpegPath, args, { stdio: ["pipe", "ignore", "pipe"] });

    let stderrLog = "";

    ff.stderr.on("data", (d) => {
      const msg = d.toString();
      stderrLog += msg;
      if (msg.toLowerCase().includes("error")) error(`ffmpeg stderr: ${msg.trim()}`);
    });

    ff.on("error", (err) => {
      error(`ffmpeg spawn error: ${err.message}`);
      reject(new Error(`ffmpeg spawn failed: ${err.message}`));
    });

    ff.on("close", (code, signal) => {
      if (code === 0) {
        try {
          const stat = fs.statSync(outPath);
          if (stat.size <= 0) {
            return reject(new Error("ffmpeg produced empty output file"));
          }
          return resolve(outPath);
        } catch (e) {
          return reject(new Error(`Output file missing: ${e.message}`));
        }
      }
      const reason =
        stderrLog.trim() ||
        (signal ? `ffmpeg terminated by signal ${signal}` : `ffmpeg exited with code ${code}`);
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

    const outPath = await withRetries(
      () => runFfmpegConcatToFile(urls),
      { retries: 3, delay: 2500, label: "ffmpeg:concat" }
    );

    // Stream upload to R2 (avoid buffering in memory)
    await putObject(
      "merged",
      outputKey,
      fs.createReadStream(outPath),
      "audio/mpeg"
    );

    const publicUrl = `${PUBLIC_BASE_URL_MERGED}/${encodeURIComponent(outputKey)}`;

    // Clean up temp file / folder
    try {
      fs.rmSync(path.dirname(outPath), { recursive: true, force: true });
    } catch (e) {
      warn(`Temp cleanup failed: ${e.message}`);
    }

    info({ outputKey, publicUrl }, "✅ Merge complete & uploaded");
    return { key: outputKey, url: publicUrl };
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
