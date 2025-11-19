// ============================================================
// 🎵 Modular Podcast Processor (Optimized Version)
// ============================================================
// Two-step pipeline:
//   1. Apply fade in/out effects
//   2. Apply audio effects (concat + compression + loudnorm)
// ============================================================

import fs from "fs";
import path from "path";
import { spawn, spawnSync } from "child_process";
import { info, warn, error,debug} from "#logger.js";
import { startKeepAlive, stopKeepAlive } from "#shared/keepalive.js";
import { putObject } from "#shared/r2-client.js";

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

const PODCAST_FFMPEG_TIMEOUT_MS = Number(
  process.env.PODCAST_FFMPEG_TIMEOUT_MS || 5 * 60 * 1000
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
    if (stats.size === 0) {
      throw new Error(`File is empty: 0 bytes`);
    }

    const result = spawnSync('ffprobe', [
      '-v', 'error',
      '-select_streams', 'a:0',
      '-show_entries', 'stream=duration,codec_name,sample_rate,channels,bit_rate',
      '-of', 'json',
      filePath
    ], { encoding: 'utf8', timeout: 10000 });

    if (result.status !== 0) {
      throw new Error(`ffprobe failed: ${result.stderr || 'Unknown error'}`);
    }

    const probeInfo = JSON.parse(result.stdout);
    if (!probeInfo.streams || probeInfo.streams.length === 0) {
      throw new Error('No audio streams detected');
    }

    const stream = probeInfo.streams[0];
    debug(`✅ Audio file verified: ${label}`, {
      sessionId,
      filePath,
      size: stats.size,
      codec: stream.codec_name,
      duration: stream.duration,
      sampleRate: stream.sample_rate,
      channels: stream.channels,
      bitRate: stream.bit_rate
    });

    return probeInfo;
  } catch (err) {
    throw new Error(`Audio file verification failed for ${label}: ${err.message}`);
  }
}

// ============================================================
// Utility: Execute FFmpeg with timeout
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
        warn(`⚠️ ${label} timed out, killing ffmpeg`, { sessionId, timeoutMs });
        try {
          ff.kill("SIGKILL");
        } catch {}
        reject(new Error(`ffmpeg timed out after ${timeoutMs} ms`));
      }, timeoutMs);
    }

    ff.stderr.on("data", (data) => {
      const txt = data.toString();
      stderr += txt;
      
      if (txt.toLowerCase().includes("invalid argument") || 
          txt.toLowerCase().includes("format mp3 detected only with low score") ||
          txt.toLowerCase().includes("failed to read frame size") ||
          txt.toLowerCase().includes("could not seek to")) {
        warn(`🔴 Critical FFmpeg input error (${label})`, { sessionId, chunk: txt });
      }
      
      if (txt.toLowerCase().includes("error")) {
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

      if (code === 0) {
        resolve();
      } else {
        const errorMsg = `ffmpeg failed (code ${code}) for ${label}: ${stderr.slice(-500)}`;
        reject(new Error(errorMsg));
      }
    });
  });
}

// ============================================================
// Utility: Download remote file with streaming and retry
// ============================================================
async function downloadToLocal(url, targetPath, label, sessionId, retries = 3) {
  let lastError = null;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      debug(`⬇️ Downloading ${label} (attempt ${attempt}/${retries})`, { sessionId, url });

      const res = await fetch(url, {
        signal: AbortSignal.timeout(60000),
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      }

      const contentLength = res.headers.get('content-length');
      const expectedBytes = contentLength ? parseInt(contentLength, 10) : null;

      const fileStream = fs.createWriteStream(targetPath);
      let bytesWritten = 0;

      try {
        const reader = res.body.getReader();

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          fileStream.write(value);
          bytesWritten += value.length;
        }

        await new Promise((resolve, reject) => {
          fileStream.end();
          fileStream.on('finish', resolve);
          fileStream.on('error', reject);
        });

        if (expectedBytes && bytesWritten !== expectedBytes) {
          throw new Error(
            `Size mismatch: expected ${expectedBytes} bytes, got ${bytesWritten} bytes`
          );
        }

        if (bytesWritten < 1000) {
          throw new Error(`File too small: ${bytesWritten} bytes`);
        }

        debug(`✅ Downloaded ${label}`, { 
          sessionId, 
          bytes: bytesWritten, 
          expected: expectedBytes,
          targetPath 
        });

        await verifyAudioFile(targetPath, label, sessionId);
        return;

      } catch (err) {
        fileStream.destroy();
        throw err;
      }

    } catch (err) {
      lastError = err;
      warn(`⚠️ Download attempt ${attempt}/${retries} failed for ${label}`, {
        sessionId,
        error: err.message,
      });

      try {
        await fs.promises.unlink(targetPath);
      } catch {}

      if (attempt < retries) {
        const delay = 2000 * Math.pow(2, attempt - 1);
        await new Promise((res) => setTimeout(res, delay));
      }
    }
  }

  throw new Error(`Failed to download ${label} after ${retries} attempts: ${lastError?.message}`);
}

// ============================================================
// STEP 1: Apply fade in/out effects
// ============================================================
async function applyFades(sessionId, introPath, outroPath) {
  info("🎚️ STEP 1: Applying fade in/out effects", { sessionId });

  const introFadedPath = path.join(TMP_DIR, `${sessionId}_intro_faded.mp3`);
  const outroFadedPath = path.join(TMP_DIR, `${sessionId}_outro_faded.mp3`);

  await verifyAudioFile(introPath, "intro for fading", sessionId);
  await verifyAudioFile(outroPath, "outro for fading", sessionId);

  // Fade in intro
  await runFFmpeg(
    [
      "-y",
      "-xerror",
      "-i",
      introPath,
      "-af",
      `afade=t=in:d=${INTRO_FADE_SEC}`,
      "-c:a",
      "libmp3lame",
      "-b:a",
      "128k",
      introFadedPath,
    ],
    "fade-intro",
    sessionId
  );

  // Fade out outro (reverse trick)
  await runFFmpeg(
    [
      "-y",
      "-xerror",
      "-i",
      outroPath,
      "-af",
      `areverse,afade=t=in:d=${OUTRO_FADE_SEC},areverse`,
      "-c:a",
      "libmp3lame",
      "-b:a",
      "128k",
      outroFadedPath,
    ],
    "fade-outro",
    sessionId
  );

  await verifyAudioFile(introFadedPath, "faded intro", sessionId);
  await verifyAudioFile(outroFadedPath, "faded outro", sessionId);

  info("🎚️ STEP 1 complete: Fades applied", {
    sessionId,
    introFaded: introFadedPath,
    outroFaded: outroFadedPath,
  });

  return { introFadedPath, outroFadedPath };
}

// ============================================================
// STEP 2: Apply audio effects (concat + compression + loudnorm)
// ============================================================
async function applyAudioEffects(
  sessionId,
  introFadedPath,
  mainPath,
  outroFadedPath,
  outputPath
) {
  info("🎚️ STEP 2: Applying audio effects (concat + compression + loudnorm)", {
    sessionId,
  });

  await verifyAudioFile(introFadedPath, "faded intro for effects", sessionId);
  await verifyAudioFile(mainPath, "main audio for effects", sessionId);
  await verifyAudioFile(outroFadedPath, "faded outro for effects", sessionId);

  const filterComplex = `
    [0:a][1:a][2:a]concat=n=3:v=0:a=1,
    acompressor=threshold=-18dB:ratio=2:attack=5:release=120,
    loudnorm=I=-16:TP=-1.5:LRA=11:print_format=none[out]
  `.replace(/\s+/g, " ");

  await runFFmpeg(
    [
      "-y",
      "-xerror",
      "-i",
      introFadedPath,
      "-i",
      mainPath,
      "-i",
      outroFadedPath,
      "-filter_complex",
      filterComplex,
      "-map",
      "[out]",
      "-c:a",
      "libmp3lame",
      "-b:a",
      "128k",
      outputPath,
    ],
    "audio-effects",
    sessionId
  );

  await verifyAudioFile(outputPath, "final podcast output", sessionId);
  info("🎚️ STEP 2 complete: Audio effects applied", { sessionId, outputPath });
}

// ============================================================
// Pipeline orchestrator
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
  info(`🎵 Running podcast pipeline (attempt ${attempt}/${total})`, { sessionId });

  await verifyAudioFile(introPath, "pipeline intro", sessionId);
  await verifyAudioFile(mainPath, "pipeline main", sessionId);
  await verifyAudioFile(outroPath, "pipeline outro", sessionId);

  // STEP 1: Apply fades
  const { introFadedPath, outroFadedPath } = await applyFades(
    sessionId,
    introPath,
    outroPath
  );

  // STEP 2: Apply audio effects
  await applyAudioEffects(
    sessionId,
    introFadedPath,
    mainPath,
    outroFadedPath,
    outputPath
  );
}

// ============================================================
// Cleanup helper
// ============================================================
async function cleanupTempFiles(sessionId) {
  try {
    const files = await fs.promises.readdir(TMP_DIR);
    const sessionFiles = files.filter(f => f.includes(sessionId));
    
    await Promise.allSettled(
      sessionFiles.map(file => fs.promises.unlink(path.join(TMP_DIR, file)))
    );
    
    info("🧹 Cleaned up temporary files", { sessionId, files: sessionFiles.length });
  } catch (cleanupErr) {
    warn("⚠️ Failed to cleanup temporary files", { sessionId, error: cleanupErr.message });
  }
}

// ============================================================
// Main: podcastProcessor
// ============================================================
export async function podcastProcessor(sessionId, editedBuffer) {
  const label = `podcastProcessor:${sessionId}`;

  if (!PODCAST_INTRO_URL || !PODCAST_OUTRO_URL) {
    warn(
      "⚠️ PODCAST_INTRO_URL or PODCAST_OUTRO_URL missing — skipping mixdown",
      { sessionId }
    );
    return editedBuffer;
  }

  if (!editedBuffer || editedBuffer.length === 0) {
    warn("⚠️ Invalid editedBuffer - empty, skipping podcast processing", {
      sessionId,
      bufferLength: editedBuffer?.length || 0
    });
    return editedBuffer;
  }

  const introPath = path.join(TMP_DIR, `${sessionId}_intro.mp3`);
  const mainPath = path.join(TMP_DIR, `${sessionId}_main.mp3`);
  const outroPath = path.join(TMP_DIR, `${sessionId}_outro.mp3`);
  const finalPath = path.join(TMP_DIR, `${sessionId}_final.mp3`);

  try {
    await fs.promises.writeFile(mainPath, editedBuffer);
    
    const stats = await fs.promises.stat(mainPath);
    if (stats.size === 0) {
      throw new Error(`Main audio file is empty after write`);
    }
    
    info("💾 Main audio written to disk", { sessionId, bytes: stats.size });

    await downloadToLocal(PODCAST_INTRO_URL, introPath, "intro", sessionId);
    await downloadToLocal(PODCAST_OUTRO_URL, outroPath, "outro", sessionId);

    let finalBuffer = null;
    let lastError = null;

    startKeepAlive(label, 15000);

    for (let attempt = 1; attempt <= MAX_PODCAST_RETRIES; attempt++) {
      try {
        try {
          await fs.promises.unlink(finalPath);
        } catch {}

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

        if (candidate.length === 0) {
          throw new Error(`Final MP3 is empty`);
        }

        finalBuffer = candidate;

        info("✅ podcastProcessor succeeded", {
          sessionId,
          bytes: finalBuffer.length,
        });

        break;
      } catch (err) {
        lastError = err;

        warn("⚠️ podcastProcessor pipeline attempt failed", {
          sessionId,
          attempt,
          maxAttempts: MAX_PODCAST_RETRIES,
          error: err.message,
        });

        if (attempt < MAX_PODCAST_RETRIES) {
          const delay =
            PODCAST_RETRY_DELAY_MS * Math.pow(PODCAST_RETRY_BACKOFF, attempt - 1);

          info("🔁 Retrying podcastProcessor", { sessionId, attempt, delayMs: delay });
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


