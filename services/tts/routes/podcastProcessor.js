import logger from "../service-logger.js";
const { info, warn, error, debug } = logger;
// ============================================================
// 🎵 Modular Podcast Processor (Optimized for Podcast Output)
// ============================================================
// Two-step pipeline:
//   1. Apply fade in/out effects to intro/outro
//   2. Concat intro + main + outro, apply bus compression + RMS normalisation + light EQ
// ============================================================

import fs from "fs";
import path from "path";
import { spawn, spawnSync } from "child_process";
import { startKeepAlive, stopKeepAlive } from "#shared/keepalive.js";
import { uploadBuffer } from "#shared/r2-client.js"; // R2 upload

// ============================================================
// Configuration
// ============================================================
const TMP_DIR = "/tmp/podcast_master";

const PODCAST_INTRO_URL = process.env.PODCAST_INTRO_URL || "";
const PODCAST_OUTRO_URL = process.env.PODCAST_OUTRO_URL || "";

const MIN_INTRO_DURATION = Number(process.env.MIN_INTRO_DURATION || 3);
const MIN_OUTRO_DURATION = Number(process.env.MIN_OUTRO_DURATION || 3);

const INTRO_FADE_SEC = Math.max(0.1, MIN_INTRO_DURATION);
const OUTRO_FADE_SEC = Math.max(0.1, MIN_OUTRO_DURATION);

const MAX_PODCAST_RETRIES = Number(
  process.env.MAX_PODCAST_RETRIES || process.env.MAX_CHUNK_RETRIES || 3
);

const PODCAST_RETRY_DELAY_MS = Number(
  process.env.PODCAST_RETRY_DELAY_MS || process.env.RETRY_DELAY_MS || 2000
);

const PODCAST_RETRY_BACKOFF = Number(process.env.RETRY_BACKOFF_MULTIPLIER || 2);

const RAW_PODCAST_FFMPEG_TIMEOUT_MS = Number(
  process.env.PODCAST_FFMPEG_TIMEOUT_MS || 25 * 60 * 1000
);

const PODCAST_FFMPEG_TIMEOUT_MS = Math.max(
  RAW_PODCAST_FFMPEG_TIMEOUT_MS,
  10 * 60 * 1000
);

if (!fs.existsSync(TMP_DIR)) {
  fs.mkdirSync(TMP_DIR, { recursive: true });
}

// ============================================================
// Utility: Audio File Verification
// ============================================================
async function verifyAudioFile(filePath, label, sessionId) {
  try {
    const stats = await fs.promises.stat(filePath);
    if (stats.size === 0) throw new Error(`File is empty: 0 bytes`);

    const result = spawnSync(
      "ffprobe",
      [
        "-v",
        "error",
        "-select_streams",
        "a:0",
        "-show_entries",
        "stream=duration,codec_name,sample_rate,channels,bit_rate",
        "-of",
        "json",
        filePath,
      ],
      { encoding: "utf8", timeout: 10000 }
    );

    if (result.status !== 0)
      throw new Error(`ffprobe failed: ${result.stderr || "Unknown error"}`);

    const probeInfo = JSON.parse(result.stdout);
    if (!probeInfo.streams || probeInfo.streams.length === 0)
      throw new Error("No audio streams detected");

    const stream = probeInfo.streams[0];
    info(`✅ Audio file verified: ${label}`, {
      sessionId,
      filePath,
      size: stats.size,
      codec: stream.codec_name,
      duration: stream.duration,
      sampleRate: stream.sample_rate,
      channels: stream.channels,
      bitRate: stream.bit_rate,
    });

    return probeInfo;
  } catch (err) {
    throw new Error(
      `Audio file verification failed for ${label}: ${err.message}`
    );
  }
}

// ============================================================
// Utility: Run FFmpeg with timeout
// ============================================================
function runFFmpeg(args, label, sessionId, timeoutMs = PODCAST_FFMPEG_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    const ff = spawn("ffmpeg", args);
    let stderr = "";
    let timeoutId = null;
    let settled = false;

    if (timeoutMs > 0) {
      timeoutId = setTimeout(() => {
        if (settled) return;
        settled = true;
        warn(`⚠️ ${label} timed out — killing ffmpeg`, { sessionId, timeoutMs });
        try { ff.kill("SIGKILL"); } catch {}
        reject(new Error(`ffmpeg timed out after ${timeoutMs} ms`));
      }, timeoutMs);
    }

    ff.stderr.on("data", (data) => {
      const txt = data.toString();
      stderr += txt;

      const lower = txt.toLowerCase();
      if (
        lower.includes("error") ||
        lower.includes("invalid") ||
        lower.includes("failed")
      ) {
        warn(`⚠️ ffmpeg stderr (${label})`, { sessionId, chunk: txt });
      }
    });

    ff.on("error", (err) => {
      if (settled) return;
      settled = true;
      if (timeoutId) clearTimeout(timeoutId);
      reject(err);
    });

    ff.on("close", (code) => {
      if (settled) return;
      settled = true;
      if (timeoutId) clearTimeout(timeoutId);

      if (code === 0) return resolve();
      reject(new Error(`ffmpeg failed (${label}) [code ${code}]: ${stderr}`));
    });
  });
}

// ============================================================
// Download remote file
// ============================================================
async function downloadToLocal(url, targetPath, label, sessionId, retries = 3) {
  let lastError = null;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      info(`⬇️ Downloading ${label} (attempt ${attempt}/${retries})`, {
        sessionId,
        url,
      });

      const res = await fetch(url, { signal: AbortSignal.timeout(60000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);

      const fileStream = fs.createWriteStream(targetPath);
      let bytesWritten = 0;

      const reader = res.body.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        fileStream.write(value);
        bytesWritten += value.length;
      }

      await new Promise((resolve, reject) => {
        fileStream.end();
        fileStream.on("finish", resolve);
        fileStream.on("error", reject);
      });

      if (bytesWritten < 1000)
        throw new Error(`File too small: ${bytesWritten} bytes`);

      info(`✅ Downloaded ${label}`, { sessionId, bytes: bytesWritten });

      await verifyAudioFile(targetPath, label, sessionId);
      return;
    } catch (err) {
      lastError = err;
      warn(`⚠️ Download attempt ${attempt}/${retries} failed (${label})`, {
        sessionId,
        error: err.message,
      });

      try { await fs.promises.unlink(targetPath); } catch {}

      if (attempt < retries) {
        const delay = 2000 * Math.pow(2, attempt - 1);
        await new Promise((res) => setTimeout(res, delay));
      }
    }
  }

  throw new Error(
    `Failed to download ${label} after ${retries} attempts: ${lastError?.message}`
  );
}

// ============================================================
// STEP 1: Fades
// ============================================================
async function applyFades(sessionId, introPath, outroPath) {
  info("🔧 STEP 1: Applying fade in/out effects", { sessionId });

  const introFadedPath = path.join(TMP_DIR, `${sessionId}_intro_faded.mp3`);
  const outroFadedPath = path.join(TMP_DIR, `${sessionId}_outro_faded.mp3`);

  await verifyAudioFile(introPath, "intro for fading", sessionId);
  await verifyAudioFile(outroPath, "outro for fading", sessionId);

  await runFFmpeg(
    ["-y", "-xerror", "-i", introPath, "-af", `afade=t=in:d=${INTRO_FADE_SEC}`,
     "-c:a", "libmp3lame", "-b:a", "128k", introFadedPath],
    "fade-intro",
    sessionId
  );

  await runFFmpeg(
    ["-y", "-xerror", "-i", outroPath,
     "-af", `areverse,afade=t=in:d=${OUTRO_FADE_SEC},areverse`,
     "-c:a", "libmp3lame", "-b:a", "128k", outroFadedPath],
    "fade-outro",
    sessionId
  );

  await verifyAudioFile(introFadedPath, "faded intro", sessionId);
  await verifyAudioFile(outroFadedPath, "faded outro", sessionId);

  info("✅ STEP 1 complete: Fades applied", {
    sessionId,
    introFaded: introFadedPath,
    outroFaded: outroFadedPath,
  });

  return { introFadedPath, outroFadedPath };
}

// ============================================================
// STEP 2: Concat + Effects
// ============================================================
async function applyAudioEffects(
  sessionId,
  introFadedPath,
  mainPath,
  outroFadedPath,
  outputPath
) {
  info("🔧 STEP 2: Applying audio effects", { sessionId });

  await verifyAudioFile(introFadedPath, "faded intro", sessionId);
  await verifyAudioFile(mainPath, "main audio", sessionId);
  await verifyAudioFile(outroFadedPath, "faded outro", sessionId);

  const concatPath = path.join(TMP_DIR, `${sessionId}_combined_concat.mp3`);
  const compressedPath = path.join(TMP_DIR, `${sessionId}_combined_compressed.mp3`);

  // Concat intro + main + outro
  await runFFmpeg(
    [
      "-y", "-xerror",
      "-i", introFadedPath, "-i", mainPath, "-i", outroFadedPath,
      "-filter_complex", "[0:a][1:a][2:a]concat=n=3:v=0:a=1[out]",
      "-map", "[out]",
      "-c:a", "libmp3lame", "-b:a", "256k",
      concatPath,
    ],
    "audio-effects-concat",
    sessionId
  );

  await verifyAudioFile(concatPath, "post-concat mix", sessionId);

  // Compression
  await runFFmpeg(
    [
      "-y", "-xerror",
      "-i", concatPath,
      "-af",
      "acompressor=threshold=-18dB:ratio=2:attack=5:release=120",
      "-c:a", "libmp3lame", "-b:a", "256k",
      compressedPath,
    ],
    "audio-effects-compressor",
    sessionId
  );

  await verifyAudioFile(compressedPath, "post-compressor mix", sessionId);

  // Final EQ + RMS norm
  const rmsEqFilter = `
    dynaudnorm=f=250:g=10:p=0.9:m=5,
    equalizer=f=120:t=h:width=200:g=2,
    equalizer=f=3500:t=h:width=1000:g=2
  `.replace(/\s+/g, " ");

  await runFFmpeg(
    [
      "-y", "-xerror",
      "-i", compressedPath,
      "-af", rmsEqFilter,
      "-c:a", "libmp3lame", "-b:a", "256k",
      outputPath,
    ],
    "audio-effects-rms-eq",
    sessionId
  );

  await verifyAudioFile(outputPath, "final podcast output", sessionId);
  info("✅ STEP 2 complete: Audio effects applied", { sessionId, outputPath });
}

// ============================================================
// Pipeline wrapper
// ============================================================
async function runPodcastPipeline(
  sessionId,
  introPath,
  mainPath,
  outroPath,
  outputPath,
  attempt,
  total
) {
  info(`🎵 Running podcast pipeline (attempt ${attempt}/${total})`, {
    sessionId,
  });

  await verifyAudioFile(introPath, "pipeline intro", sessionId);
  await verifyAudioFile(mainPath, "pipeline main", sessionId);
  await verifyAudioFile(outroPath, "pipeline outro", sessionId);

  const { introFadedPath, outroFadedPath } = await applyFades(
    sessionId,
    introPath,
    outroPath
  );

  await applyAudioEffects(
    sessionId,
    introFadedPath,
    mainPath,
    outroFadedPath,
    outputPath
  );
}

// ============================================================
// Cleanup
// ============================================================
async function cleanupTempFiles(sessionId) {
  try {
    const files = await fs.promises.readdir(TMP_DIR);
    const sessionFiles = files.filter((f) => f.includes(sessionId));

    await Promise.allSettled(
      sessionFiles.map((file) =>
        fs.promises.unlink(path.join(TMP_DIR, file))
      )
    );

    info("🧹 Cleaned up temporary files", {
      sessionId,
      files: sessionFiles.length,
    });
  } catch (cleanupErr) {
    warn("⚠️ Failed to cleanup temporary files", {
      sessionId,
      error: cleanupErr.message,
    });
  }
}

// ============================================================
// MAIN PROCESSOR
// ============================================================
export async function podcastProcessor(sessionId, editedBuffer) {
  const label = `podcastProcessor:${sessionId}`;

  if (!PODCAST_INTRO_URL || !PODCAST_OUTRO_URL) {
    warn("⚠️ Missing intro/outro URLs — skipping mixdown", { sessionId });
    return editedBuffer;
  }

  let workingBuffer = editedBuffer;

  if (typeof workingBuffer === "string") {
    workingBuffer = await fs.promises.readFile(workingBuffer);
  } else if (
    workingBuffer &&
    typeof workingBuffer === "object" &&
    !(workingBuffer instanceof Buffer)
  ) {
    if (typeof workingBuffer.localPath === "string") {
      workingBuffer = await fs.promises.readFile(workingBuffer.localPath);
    }
  }

  if (!workingBuffer || workingBuffer.length === 0) {
    warn("⚠️ Invalid editedBuffer — skipping", {
      sessionId,
      bufferLength: workingBuffer?.length || 0,
    });
    return workingBuffer;
  }

  const introPath = path.join(TMP_DIR, `${sessionId}_intro.mp3`);
  const mainPath = path.join(TMP_DIR, `${sessionId}_main.mp3`);
  const outroPath = path.join(TMP_DIR, `${sessionId}_outro.mp3`);
  const finalPath = path.join(TMP_DIR, `${sessionId}_final.mp3`);

  try {
    await fs.promises.writeFile(mainPath, workingBuffer);

    const stats = await fs.promises.stat(mainPath);
    if (stats.size === 0) throw new Error("Main audio file is empty");
    if (stats.size < 5000)
      throw new Error(`Main MP3 truncated (${stats.size} bytes)`);

    info("💾 Main audio written", { sessionId, bytes: stats.size });

    await downloadToLocal(PODCAST_INTRO_URL, introPath, "intro", sessionId);
    await downloadToLocal(PODCAST_OUTRO_URL, outroPath, "outro", sessionId);

    let finalBuffer = null;
    let lastError = null;

    startKeepAlive(label, 15000);

    for (let attempt = 1; attempt <= MAX_PODCAST_RETRIES; attempt++) {
      try {
        try { await fs.promises.unlink(finalPath); } catch {}

        await runPodcastPipeline(
          sessionId,
          introPath,
          mainPath,
          outroPath,
          finalPath,
          attempt,
          MAX_PODCAST_RETRIES
        );

        const candidate = await fs.promises.readFile(finalPath);
        if (candidate.length === 0)
          throw new Error("Final MP3 empty");

        finalBuffer = candidate;

        info("✅ podcastProcessor succeeded", {
          sessionId,
          bytes: finalBuffer.length,
        });

        break;
      } catch (err) {
        lastError = err;

        warn("⚠️ podcastProcessor attempt failed", {
          sessionId,
          attempt,
          maxAttempts: MAX_PODCAST_RETRIES,
          error: err.message,
        });

        if (attempt < MAX_PODCAST_RETRIES) {
          const delay =
            PODCAST_RETRY_DELAY_MS *
            Math.pow(PODCAST_RETRY_BACKOFF, attempt - 1);

          info("🔁 Retrying podcastProcessor", {
            sessionId,
            attempt,
            delayMs: delay,
          });

          await new Promise((res) => setTimeout(res, delay));
        }
      }
    }

    stopKeepAlive(label);

    if (!finalBuffer) {
      throw new Error(
        `Podcast processing failed after ${MAX_PODCAST_RETRIES} attempts: ${lastError?.message}`
      );
    }

    await cleanupTempFiles(sessionId);

    info("✅ podcastProcessor completed successfully", {
      sessionId,
      finalSize: finalBuffer.length,
    });

    // ============================================================
    // FIXED — FINAL MP3 IS NOW UPLOADED TO R2 BUCKET "podcast"
    // ============================================================
    await uploadBuffer("podcast", `${sessionId}.mp3`, finalBuffer, "audio/mpeg");

    info("📡 Uploaded final podcast MP3 to R2 bucket 'podcast'", {
      sessionId,
      key: `${sessionId}.mp3`,
      size: finalBuffer.length,
    });

    return finalBuffer;
  } catch (err) {
    stopKeepAlive(label);
    await cleanupTempFiles(sessionId);

    error("❌ podcastProcessor failed", {
      sessionId,
      error: err.message,
      stack: err.stack,
    });

    throw err;
  }
}
