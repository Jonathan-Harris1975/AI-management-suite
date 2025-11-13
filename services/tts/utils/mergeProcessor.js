// services/tts/utils/mergeProcessor.js
// ============================================================
// 🎧 Merge Processor — robust async ffmpeg concatenation
// - Downloads chunks with timeout + retries
// - Builds concat list
// - Executes ffmpeg via async exec (no blocking, no deadlocks)
// - Uploads merged MP3 to R2
// ============================================================

import fs from "fs";
import path from "path";
import util from "util";
import { exec } from "child_process";
import fetch from "node-fetch";
import { info, error, warn } from "#logger.js";
import { startKeepAlive, stopKeepAlive } from "#shared/keepalive.js";
import { uploadBuffer } from "#shared/r2-client.js";

const execAsync = util.promisify(exec);

const TMP_DIR = "/tmp/podcast_merge";
const MERGED_BUCKET = "merged";
const DOWNLOAD_TIMEOUT_MS = 20000;
const DOWNLOAD_RETRIES = 3;

function ensureTmpDir() {
  if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR, { recursive: true });
}

// Timeout wrapper
function fetchWithTimeout(url, options = {}, timeout = DOWNLOAD_TIMEOUT_MS) {
  return Promise.race([
    fetch(url, options),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`Fetch timed out: ${url}`)), timeout)
    ),
  ]);
}

// Download with retries
async function downloadChunk(url, localPath, attempt = 1) {
  try {
    const res = await fetchWithTimeout(url);
    if (!res.ok) throw new Error(`HTTP ${res.status} – ${url}`);

    const buf = Buffer.from(await res.arrayBuffer());
    fs.writeFileSync(localPath + ".tmp", buf);
    fs.renameSync(localPath + ".tmp", localPath);

    return true;
  } catch (err) {
    if (attempt < DOWNLOAD_RETRIES) {
      warn({ url, attempt }, "Retrying failed chunk download…");
      return downloadChunk(url, localPath, attempt + 1);
    }
    throw new Error(`Download failed after ${DOWNLOAD_RETRIES} attempts: ${url}`);
  }
}

async function verifyFfmpeg() {
  try {
    const { stdout } = await execAsync("ffmpeg -version");
    info({ ffmpeg: stdout.split("\n")[0] }, "🔎 ffmpeg detected");
  } catch {
    throw new Error("ffmpeg is missing in runtime container");
  }
}

export async function mergeProcessor(sessionId, chunkUrls = []) {
  const sid = sessionId || `TT-${Date.now()}`;

  startKeepAlive(`mergeProcessor:${sid}`, 25000);
  ensureTmpDir();

  info({ sessionId: sid, chunks: chunkUrls.length }, "🎧 Starting mergeProcessor");

  try {
    if (!Array.isArray(chunkUrls) || chunkUrls.length === 0) {
      throw new Error("mergeProcessor requires a non-empty array of chunk URLs.");
    }

    // Ensure ffmpeg exists before doing hours of processing
    await verifyFfmpeg();

    // 1) Download all chunks
    const localPaths = [];
    for (let i = 0; i < chunkUrls.length; i++) {
      const url = chunkUrls[i];
      const local = path.join(
        TMP_DIR,
        `${sid}_chunk_${String(i + 1).padStart(3, "0")}.mp3`
      );

      info({ sessionId: sid, url }, `⬇️ Downloading chunk ${i + 1}/${chunkUrls.length}`);

      await downloadChunk(url, local);
      localPaths.push(local);
    }

    // 2) Write ffmpeg concat list
    const listPath = path.join(TMP_DIR, `${sid}_list.txt`);
    const outPath = path.join(TMP_DIR, `${sid}_merged.mp3`);

    fs.writeFileSync(
      listPath,
      localPaths.map((p) => `file '${p.replace(/'/g, "'\\''")}'`).join("\n"),
      "utf8"
    );

    info({ sessionId: sid }, "📝 Concat list ready");

    // 3) Run ffmpeg merge (async, no deadlocks)
    const mergeCmd = `ffmpeg -hide_banner -loglevel error -y -f concat -safe 0 -i "${listPath}" -c copy "${outPath}"`;

    info({ sessionId: sid, cmd: mergeCmd }, "🎚 Running ffmpeg merge…");

    try {
      const { stdout, stderr } = await execAsync(mergeCmd, {
        maxBuffer: 1024 * 1024 * 20, // 20 MB
      });

      if (stdout) info({ sessionId: sid, stdout }, "🎧 ffmpeg stdout");
      if (stderr) info({ sessionId: sid, stderr }, "🎧 ffmpeg stderr");
    } catch (ffmpegErr) {
      error({ sessionId: sid, stderr: ffmpegErr.stderr }, "💥 ffmpeg merge failed");
      throw new Error(`ffmpeg merge failed: ${ffmpegErr.stderr || ffmpegErr.message}`);
    }

    // 4) Upload merged file
    const mergedBuf = fs.readFileSync(outPath);
    const mergedKey = `${sid}.mp3`;

    await uploadBuffer(MERGED_BUCKET, mergedKey, mergedBuf, "audio/mpeg");

    info(
      { sessionId: sid, key: mergedKey, bytes: mergedBuf.length },
      "💾 Uploaded merged MP3 to R2"
    );

    stopKeepAlive();
    return { key: mergedKey, localPath: outPath };
  } catch (err) {
    error({ sessionId: sid, error: err.message }, "💥 mergeProcessor failed");
    stopKeepAlive();
    throw err;
  }
}

export default mergeProcessor;
