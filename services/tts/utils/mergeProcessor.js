// services/tts/utils/mergeProcessor.js
// =======================================================================
// 🎧 STREAMING MERGE PROCESSOR (ultra-low-RAM, OOM-proof)
// - Streams MP3 chunks directly into ffmpeg via stdin
// - No concat list, no ffmpeg buffering of all files
// - Prevents memory spikes in Shiper environments
// =======================================================================

import fs from "fs";
import path from "path";
import { spawn } from "child_process";
import fetch from "node-fetch";
import { info, error, warn } from "#logger.js";
import { startKeepAlive, stopKeepAlive } from "#shared/keepalive.js";
import { uploadBuffer } from "#shared/r2-client.js";

const TMP_DIR = "/tmp/podcast_merge";
const MERGED_BUCKET = "merged";
const DOWNLOAD_TIMEOUT_MS = 20000;
const DOWNLOAD_RETRIES = 3;

function ensureTmpDir() {
  if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR, { recursive: true });
}

function fetchWithTimeout(url, timeout = DOWNLOAD_TIMEOUT_MS) {
  return Promise.race([
    fetch(url),
    new Promise((_, reject) => setTimeout(() => reject(new Error(`Timeout: ${url}`)), timeout))
  ]);
}

async function downloadChunkToBuffer(url, attempt = 1) {
  try {
    const res = await fetchWithTimeout(url);
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    return Buffer.from(await res.arrayBuffer());
  } catch (err) {
    if (attempt < DOWNLOAD_RETRIES) {
      warn({ url, attempt }, "Retrying buffer download...");
      return downloadChunkToBuffer(url, attempt + 1);
    }
    throw new Error(`Failed after retries: ${url}`);
  }
}

async function verifyFfmpeg() {
  return new Promise((resolve, reject) => {
    const ff = spawn("ffmpeg", ["-version"]);
    ff.on("error", () => reject(new Error("ffmpeg missing")));
    ff.on("close", () => resolve(true));
  });
}

export async function mergeProcessor(sessionId, chunkUrls = []) {
  const sid = sessionId || `TT-${Date.now()}`;

  startKeepAlive(`mergeProcessor:${sid}`, 25000);
  ensureTmpDir();

  info({ sessionId: sid, chunks: chunkUrls.length }, "🎧 Starting streaming mergeProcessor");

  try {
    if (!Array.isArray(chunkUrls) || chunkUrls.length === 0) {
      throw new Error("mergeProcessor requires chunk URLs.");
    }

    await verifyFfmpeg();

    const outPath = path.join(TMP_DIR, `${sid}_merged.mp3`);

    // 🧵 Spawn ffmpeg in streaming mode
    const ffmpeg = spawn("ffmpeg", [
      "-hide_banner",
      "-loglevel", "error",
      "-f", "mp3",
      "-i", "pipe:0",
      "-c", "copy",
      "-y",
      outPath
    ]);

    ffmpeg.on("error", (err) => {
      error({ err }, "💥 ffmpeg spawn error");
    });

    let ffmpegStderr = "";
    ffmpeg.stderr.on("data", (d) => {
      ffmpegStderr += d.toString();
    });

    info({ sessionId: sid }, "🔌 ffmpeg streaming pipeline configured");

    // 🚰 Stream chunks sequentially
    for (let i = 0; i < chunkUrls.length; i++) {
      const url = chunkUrls[i];
      info({ sessionId: sid, url }, `⬇️ Downloading & streaming chunk ${i + 1}/${chunkUrls.length}`);

      const buf = await downloadChunkToBuffer(url);

      const ok = ffmpeg.stdin.write(buf);
      if (!ok) {
        // Wait if backpressure triggers
        await new Promise((res) => ffmpeg.stdin.once("drain", res));
      }
    }

    // 🛑 Signal to ffmpeg that input stream is complete
    ffmpeg.stdin.end();

    // ⏳ Wait for ffmpeg to finish writing output
    await new Promise((resolve, reject) => {
      ffmpeg.on("close", (code) => {
        if (code !== 0) {
          error({ stderr: ffmpegStderr }, "💥 ffmpeg merge failed");
          reject(new Error(`ffmpeg exited with code ${code}`));
        } else {
          resolve();
        }
      });
    });

    // 📤 Upload final merged file to R2
    const mergedBuf = fs.readFileSync(outPath);
    const mergedKey = `${sid}.mp3`;

    await uploadBuffer(MERGED_BUCKET, mergedKey, mergedBuf, "audio/mpeg");

    info({ sessionId: sid, key: mergedKey, bytes: mergedBuf.length }, "💾 Uploaded merged MP3 to R2");

    stopKeepAlive();
    return { key: mergedKey, localPath: outPath };
  } catch (err) {
    error({ sessionId: sid, error: err.message }, "💥 mergeProcessor failed");
    stopKeepAlive();
    throw err;
  }
}

export default mergeProcessor;
