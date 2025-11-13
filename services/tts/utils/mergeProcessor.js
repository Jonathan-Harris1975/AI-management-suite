// =======================================================================
// 🎧 MODULAR STREAMING MERGE PROCESSOR (Batching + Retries)
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
const DOWNLOAD_TIMEOUT_MS = 30000;
const DOWNLOAD_RETRIES = 5;
const MERGE_RETRIES = 6;
const BATCH_SIZE = 2;

function ensureTmpDir() {
  if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR, { recursive: true });
}

async function fetchWithTimeout(url, timeout = DOWNLOAD_TIMEOUT_MS) {
  return Promise.race([
    fetch(url),
    new Promise((_, reject) => setTimeout(() => reject(new Error(`Timeout: ${url}`)), timeout)),
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

// ----------------------------------------------------------------------
// 🧩 STREAM MERGE — low-level merge of an array of buffers
// ----------------------------------------------------------------------
async function streamMergeBuffers(buffers, outputPath, attempt = 1) {
  try {
    const ffmpeg = spawn("ffmpeg", [
      "-hide_banner",
      "-loglevel", "error",
      "-f", "mp3",
      "-i", "pipe:0",
      "-c", "copy",
      "-y",
      outputPath,
    ]);

    let stderr = "";

    ffmpeg.stderr.on("data", (d) => {
      stderr += d.toString();
    });

    ffmpeg.on("error", (err) => {
      warn({ err }, "ffmpeg spawn error");
    });

    await new Promise((resolve, reject) => {
      for (const buf of buffers) {
        const ok = ffmpeg.stdin.write(buf);
        if (!ok) ffmpeg.stdin.once("drain", () => {});
      }

      ffmpeg.stdin.end();

      ffmpeg.on("close", (code) => {
        if (code !== 0) {
          reject(new Error(`ffmpeg exited with code ${code} — ${stderr}`));
        } else {
          resolve();
        }
      });
    });

    return outputPath;
  } catch (err) {
    if (attempt < MERGE_RETRIES) {
      warn({ attempt }, `Retrying batch merge...`);
      return streamMergeBuffers(buffers, outputPath, attempt + 1);
    }
    throw err;
  }
}

// ----------------------------------------------------------------------
// 🧩 MODULAR MERGE — merge chunk URLs in batches until 1 file remains
// ----------------------------------------------------------------------
async function modularMergeChunkUrls(sessionId, urls) {
  let round = 1;

  let current = urls;

  while (current.length > 1) {
    info({ sessionId, round, groups: Math.ceil(current.length / BATCH_SIZE) }, "🔁 Batch merge round");

    const nextRoundFiles = [];

    for (let i = 0; i < current.length; i += BATCH_SIZE) {
      const group = current.slice(i, i + BATCH_SIZE);

      info({ sessionId, group }, `📦 Merging batch ${i / BATCH_SIZE + 1}`);

      const buffers = [];
      for (const url of group) {
        buffers.push(await downloadChunkToBuffer(url));
      }

      const batchOut = path.join(TMP_DIR, `${sessionId}_batch_${round}_${i}.mp3`);

      await streamMergeBuffers(buffers, batchOut);

      nextRoundFiles.push(batchOut);
    }

    // Next round replaces URLs with local batch files
    current = nextRoundFiles;
    round++;
  }

  return current[0]; // The final single merged file
}

// ----------------------------------------------------------------------
// 🧩 MAIN PROCESSOR
// ----------------------------------------------------------------------
export async function mergeProcessor(sessionId, chunkUrls = []) {
  const sid = sessionId || `TT-${Date.now()}`;

  startKeepAlive(`mergeProcessor:${sid}`, 25000);
  ensureTmpDir();

  info({ sessionId: sid, chunks: chunkUrls.length }, "🎧 Starting modular streaming mergeProcessor");

  try {
    if (!Array.isArray(chunkUrls) || chunkUrls.length === 0) {
      throw new Error("mergeProcessor requires chunk URLs.");
    }

    await verifyFfmpeg();

    // Perform modular merge (multi-stage, resilient)
    const finalMergedPath = await modularMergeChunkUrls(sid, chunkUrls);

    // Upload final file
    const mergedBuf = fs.readFileSync(finalMergedPath);
    const mergedKey = `${sid}.mp3`;

    await uploadBuffer(MERGED_BUCKET, mergedKey, mergedBuf, "audio/mpeg");

    info({ sessionId: sid, key: mergedKey, bytes: mergedBuf.length }, "💾 Uploaded modular merged MP3 to R2");

    stopKeepAlive();
    return { key: mergedKey, localPath: finalMergedPath };
  } catch (err) {
    error({ sessionId: sid, error: err.message }, "💥 mergeProcessor failed");
    stopKeepAlive();
    throw err;
  }
}

export default mergeProcessor;
