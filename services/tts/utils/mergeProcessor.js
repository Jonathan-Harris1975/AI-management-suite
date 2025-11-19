// =======================================================================
// 🎧 MODULAR STREAMING MERGE PROCESSOR
// Supports mixing remote URLs + local batch files safely
// =======================================================================

import fs from "fs";
import path from "path";
import { spawn } from "child_process";
import fetch from "node-fetch";
import { info, error, warn , debug} from "#logger.js";
import { startKeepAlive, stopKeepAlive } from "#shared/keepalive.js";
import { uploadBuffer } from "#shared/r2-client.js";

const TMP_DIR = "/tmp/podcast_merge";
const MERGED_BUCKET = "merged";

// ------------------------------------------------------------
// ⚙️ Environment-based tuning
// ------------------------------------------------------------
const DOWNLOAD_TIMEOUT_MS = Number(process.env.AI_TIMEOUT || 30000);
const MAX_RETRIES = Number(process.env.MAX_CHUNK_RETRIES || 3);
const DOWNLOAD_RETRIES = MAX_RETRIES;
const MERGE_RETRIES = MAX_RETRIES;
const RETRY_DELAY_MS = Number(process.env.RETRY_DELAY_MS || 2000);
const RETRY_BACKOFF_MULTIPLIER =
  Number(process.env.RETRY_BACKOFF_MULTIPLIER || 2);

// Merge smaller groups recursively
const BATCH_SIZE = 2;

// ------------------------------------------------------------
// 🛡 Create merge directory
// ------------------------------------------------------------
function ensureTmpDir() {
  if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR, { recursive: true });
}

// ------------------------------------------------------------
// 🧠 Type Guard — remote URL or local file?
// ------------------------------------------------------------
function isRemote(input) {
  return typeof input === "string" && /^https?:\/\//i.test(input);
}

// ------------------------------------------------------------
// 🌐 Remote Download w/ Timeout + Retries
// ------------------------------------------------------------
async function fetchWithTimeout(url) {
  return Promise.race([
    fetch(url),
    new Promise((_, reject) =>
      setTimeout(
        () => reject(new Error(`Download timeout`)),
        DOWNLOAD_TIMEOUT_MS
      )
    ),
  ]);
}

async function downloadRemoteToBuffer(url, attempt = 1) {
  try {
    const res = await fetchWithTimeout(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
  } catch (err) {
    if (attempt < DOWNLOAD_RETRIES) {
      const delay =
        RETRY_DELAY_MS * Math.pow(RETRY_BACKOFF_MULTIPLIER, attempt - 1);

      warn("Retrying remote download", { attempt, delayMs: delay });
      await new Promise((resolve) => setTimeout(resolve, delay));
      return downloadRemoteToBuffer(url, attempt + 1);
    }
    throw new Error(`Remote download failed after ${DOWNLOAD_RETRIES} attempts`);
  }
}

// ------------------------------------------------------------
// 📁 Local File Read w/ Retry
// ------------------------------------------------------------
async function loadLocalToBuffer(localPath, attempt = 1) {
  try {
    return fs.readFileSync(localPath);
  } catch (err) {
    if (attempt < DOWNLOAD_RETRIES) {
      const delay =
        RETRY_DELAY_MS * Math.pow(RETRY_BACKOFF_MULTIPLIER, attempt - 1);

      warn("Retrying local file read", { attempt, delayMs: delay });
      await new Promise((resolve) => setTimeout(resolve, delay));
      return loadLocalToBuffer(localPath, attempt + 1);
    }
    throw new Error(`Local file read failed after ${DOWNLOAD_RETRIES} attempts`);
  }
}

// ------------------------------------------------------------
// 🤝 Unified Buffer Loader (Remote or Local)
// ------------------------------------------------------------
async function loadChunk(input) {
  if (isRemote(input)) return downloadRemoteToBuffer(input);
  return loadLocalToBuffer(input);
}

// ------------------------------------------------------------
// 🎧 STREAM MERGE — merge array of buffers into outputPath
// ------------------------------------------------------------
async function streamMergeBuffers(buffers, outputPath, attempt = 1) {
  try {
    const ff = spawn("ffmpeg", [
      "-hide_banner",
      "-loglevel",
      "error",
      "-f",
      "mp3",
      "-i",
      "pipe:0",
      "-c",
      "copy",
      "-y",
      outputPath,
    ]);

    let stderr = "";

    ff.stderr.on("data", (d) => (stderr += d.toString()));

    await new Promise((resolve, reject) => {
      for (const buf of buffers) {
        const ok = ff.stdin.write(buf);
        if (!ok) ff.stdin.once("drain", () => {});
      }
      ff.stdin.end();

      ff.on("close", (code) => {
        if (code !== 0) {
          return reject(
            new Error(`FFmpeg failed (code ${code}): ${stderr}`)
          );
        }
        resolve();
      });
    });

    return outputPath;
  } catch (err) {
    if (attempt < MERGE_RETRIES) {
      const delay =
        RETRY_DELAY_MS * Math.pow(RETRY_BACKOFF_MULTIPLIER, attempt - 1);

      warn("Retrying merge batch", { attempt, delayMs: delay });
      return streamMergeBuffers(buffers, outputPath, attempt + 1);
    }
    throw err;
  }
}

// ------------------------------------------------------------
// 🧩 MODULAR BATCH MERGE (recursive, bulletproof)
// ------------------------------------------------------------
async function modularMerge(sessionId, sources) {
  let round = 1;
  let current = sources;

  while (current.length > 1) {
    debug ("Batch merge round", {
      round,
      chunksRemaining: current.length,
    });

    const next = [];

    for (let i = 0; i < current.length; i += BATCH_SIZE) {
      const group = current.slice(i, i + BATCH_SIZE);

      const buffers = [];
      for (const source of group) {
        buffers.push(await loadChunk(source));
      }

      const batchOutput = path.join(
        TMP_DIR,
        `${sessionId}_batch_${round}_${i}.mp3`
      );

      await streamMergeBuffers(buffers, batchOutput);
      next.push(batchOutput);
    }

    current = next;
    round++;
  }

  return current[0];
}

// ------------------------------------------------------------
// 🚀 MAIN PROCESSOR
// ------------------------------------------------------------
export async function mergeProcessor(sessionId, chunkUrls = []) {
  const sid = sessionId || `TT-${Date.now()}`;
  const label = `mergeProcessor:${sid}`;

  startKeepAlive(label, 25000);
  ensureTmpDir();
info("🎞️ Starting merge process")
  debug("Starting merge process", {
    sessionId: sid,
    totalChunks: chunkUrls.length,
  });

  try {
    if (!Array.isArray(chunkUrls) || chunkUrls.length === 0) {
      throw new Error("mergeProcessor requires chunk URLs.");
    }

    const finalPath = await modularMerge(sid, chunkUrls);

    const mergedBuf = fs.readFileSync(finalPath);
    const mergedKey = `${sid}.mp3`;

    await uploadBuffer(MERGED_BUCKET, mergedKey, mergedBuf, "audio/mpeg");

    // ✅ CLEAN COMPLETION SUMMARY
    info("🟩 Merge process completed")
    debug("🟩 Merge process completed", {
      sessionId: sid,
      chunksProcessed: chunkUrls.length,
      outputKey: mergedKey,
      status: "success"
    });

    stopKeepAlive(label);
    return { key: mergedKey, localPath: finalPath };
  } catch (err) {
    error("Merge process failed", { 
      sessionId: sid,
      error: err.message,
      status: "failed"
    });
    stopKeepAlive(label);
    throw err;
  }
}

export default mergeProcessor;
