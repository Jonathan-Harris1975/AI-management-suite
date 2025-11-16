// ============================================================
// 🎵 Modular Podcast Processor (Robust Version)
// ============================================================
// Four-step pipeline:
//   1. Normalize intro/outro to 48kHz mono s16 (temp memory)
//   2. Normalize main edit MP3 to 48kHz mono s16 (temp memory)
//   3. Apply fade in/out effects
//   4. Apply audio effects (compression + loudnorm)
// ============================================================

import fs from "fs";
import path from "path";
import { spawn, spawnSync } from "child_process";
import { info, warn, error } from "#logger.js";
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

const EDITED_BUCKET = process.env.R2_BUCKET_EDITED_AUDIO || "";
const PUBLIC_EDITED_BASE = process.env.R2_PUBLIC_BASE_URL_EDITED_AUDIO || "";

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

    // Try to get basic file info with ffprobe
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
    info(`✅ Audio file verified: ${label}`, {
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
      
      // Enhanced error detection
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
      info(`⬇️ Downloading ${label} (attempt ${attempt}/${retries})`, { sessionId, url });

      const res = await fetch(url, {
        signal: AbortSignal.timeout(60000), // 60s timeout
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      }

      const contentLength = res.headers.get('content-length');
      const expectedBytes = contentLength ? parseInt(contentLength, 10) : null;

      // Stream directly to file
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

        // Validate file size
        if (expectedBytes && bytesWritten !== expectedBytes) {
          throw new Error(
            `Size mismatch: expected ${expectedBytes} bytes, got ${bytesWritten} bytes`
          );
        }

        if (bytesWritten < 1000) {
          throw new Error(`File too small: ${bytesWritten} bytes`);
        }

        info(`✅ Downloaded ${label}`, { 
          sessionId, 
          bytes: bytesWritten, 
          expected: expectedBytes,
          targetPath 
        });

        // Verify the downloaded file
        await verifyAudioFile(targetPath, label, sessionId);

        return; // Success!

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

      // Clean up failed download
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
// STEP 1: Normalize intro/outro to 48kHz mono s16 (with retry)
// ============================================================
async function normalizeIntroOutro(sessionId, introPath, outroPath) {
  info("🔧 STEP 1: Normalizing intro/outro to 48kHz mono s16", { sessionId });

  const introNormPath = path.join(TMP_DIR, `${sessionId}_intro_norm.wav`);
  const outroNormPath = path.join(TMP_DIR, `${sessionId}_outro_norm.wav`);

  // Verify input files before processing
  await verifyAudioFile(introPath, "intro input", sessionId);
  await verifyAudioFile(outroPath, "outro input", sessionId);

  // Helper function to normalize a single file with retry
  async function normalizeSingleFile(inputPath, outputPath, label, retries = 2) {
    let lastError = null;

    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        info(`🔄 Normalizing ${label} (attempt ${attempt}/${retries})`, { sessionId });

        // Remove any existing output file
        try {
          await fs.promises.unlink(outputPath);
        } catch {}

        // More robust ffmpeg args with error handling
        await runFFmpeg(
          [
            "-y",
            "-xerror",
            "-err_detect", "ignore_err", // More lenient error detection
            "-fflags", "+genpts+igndts", // Generate timestamps if missing
            "-i", inputPath,
            "-ar", "48000",
            "-ac", "1",
            "-sample_fmt", "s16",
            "-acodec", "pcm_s16le",
            "-avoid_negative_ts", "make_zero",
            outputPath,
          ],
          `normalize-${label}`,
          sessionId,
          90000 // 90s timeout for normalization
        );

        // Verify output
        const stats = await fs.promises.stat(outputPath);
        if (stats.size < 1000) {
          throw new Error(`Output file too small: ${stats.size} bytes`);
        }

        await verifyAudioFile(outputPath, `normalized ${label}`, sessionId);

        info(`✅ Successfully normalized ${label}`, { 
          sessionId, 
          outputSize: stats.size 
        });

        return; // Success!

      } catch (err) {
        lastError = err;
        warn(`⚠️ Normalization attempt ${attempt}/${retries} failed for ${label}`, {
          sessionId,
          error: err.message,
        });

        if (attempt < retries) {
          const delay = 2000 * attempt;
          await new Promise((res) => setTimeout(res, delay));
        }
      }
    }

    throw new Error(`Failed to normalize ${label} after ${retries} attempts: ${lastError?.message}`);
  }

  // Normalize both files
  await normalizeSingleFile(introPath, introNormPath, "intro");
  await normalizeSingleFile(outroPath, outroNormPath, "outro");

  info("✅ STEP 1 complete: Intro/outro normalized", {
    sessionId,
    intro: introNormPath,
    outro: outroNormPath,
  });

  return { introNormPath, outroNormPath };
}

// ============================================================
// STEP 2: Normalize main edit MP3 to 48kHz mono s16
// ============================================================
async function normalizeMainAudio(sessionId, mainPath) {
  info("🔧 STEP 2: Normalizing main audio to 48kHz mono s16", { sessionId });

  const mainNormPath = path.join(TMP_DIR, `${sessionId}_main_norm.wav`);

  // Verify input file before processing
  await verifyAudioFile(mainPath, "main audio input", sessionId);

  await runFFmpeg(
    [
      "-y",
      "-xerror",
      "-err_detect", "ignore_err",
      "-fflags", "+genpts+igndts",
      "-i",
      mainPath,
      "-ar",
      "48000",
      "-ac",
      "1",
      "-sample_fmt",
      "s16",
      "-acodec",
      "pcm_s16le",
      "-avoid_negative_ts", "make_zero",
      mainNormPath,
    ],
    "normalize-main",
    sessionId
  );

  // Verify output file
  await verifyAudioFile(mainNormPath, "normalized main audio", sessionId);

  info("✅ STEP 2 complete: Main audio normalized", {
    sessionId,
    main: mainNormPath,
  });

  return mainNormPath;
}

// ============================================================
// STEP 3: Apply fade in/out effects
// ============================================================
async function applyFades(sessionId, introNormPath, mainNormPath, outroNormPath) {
  info("🔧 STEP 3: Applying fade in/out effects", { sessionId });

  const introFadedPath = path.join(TMP_DIR, `${sessionId}_intro_faded.wav`);
  const outroFadedPath = path.join(TMP_DIR, `${sessionId}_outro_faded.wav`);

  // Verify input files before processing
  await verifyAudioFile(introNormPath, "intro for fading", sessionId);
  await verifyAudioFile(outroNormPath, "outro for fading", sessionId);

  // Fade in intro
  await runFFmpeg(
    [
      "-y",
      "-xerror",
      "-i",
      introNormPath,
      "-af",
      `afade=t=in:d=${INTRO_FADE_SEC}`,
      "-acodec",
      "pcm_s16le",
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
      outroNormPath,
      "-af",
      `areverse,afade=t=in:d=${OUTRO_FADE_SEC},areverse`,
      "-acodec",
      "pcm_s16le",
      outroFadedPath,
    ],
    "fade-outro",
    sessionId
  );

  // Verify output files
  await verifyAudioFile(introFadedPath, "faded intro", sessionId);
  await verifyAudioFile(outroFadedPath, "faded outro", sessionId);

  info("✅ STEP 3 complete: Fades applied", {
    sessionId,
    introFaded: introFadedPath,
    outroFaded: outroFadedPath,
  });

  return { introFadedPath, outroFadedPath };
}

// ============================================================
// STEP 4: Apply audio effects (concat + compression + loudnorm)
// ============================================================
async function applyAudioEffects(
  sessionId,
  introFadedPath,
  mainNormPath,
  outroFadedPath,
  outputPath
) {
  info("🔧 STEP 4: Applying audio effects (concat + compression + loudnorm)", {
    sessionId,
  });

  // Verify all input files before processing
  await verifyAudioFile(introFadedPath, "faded intro for effects", sessionId);
  await verifyAudioFile(mainNormPath, "main audio for effects", sessionId);
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
      mainNormPath,
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

  // Verify final output
  await verifyAudioFile(outputPath, "final podcast output", sessionId);

  info("✅ STEP 4 complete: Audio effects applied", { sessionId, outputPath });
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

  // Verify all input files before starting pipeline
  info("🔍 Verifying input files before pipeline start", { sessionId });
  await verifyAudioFile(introPath, "pipeline intro", sessionId);
  await verifyAudioFile(mainPath, "pipeline main", sessionId);
  await verifyAudioFile(outroPath, "pipeline outro", sessionId);

  // STEP 1: Normalize intro/outro
  const { introNormPath, outroNormPath } = await normalizeIntroOutro(
    sessionId,
    introPath,
    outroPath
  );

  // STEP 2: Normalize main audio
  const mainNormPath = await normalizeMainAudio(sessionId, mainPath);

  // STEP 3: Apply fades
  const { introFadedPath, outroFadedPath } = await applyFades(
    sessionId,
    introNormPath,
    mainNormPath,
    outroNormPath
  );

  // STEP 4: Apply audio effects
  await applyAudioEffects(
    sessionId,
    introFadedPath,
    mainNormPath,
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

  // Validate environment
  if (!PODCAST_INTRO_URL || !PODCAST_OUTRO_URL) {
    warn(
      "⚠️ PODCAST_INTRO_URL or PODCAST_OUTRO_URL missing — skipping mixdown",
      { sessionId }
    );
    return editedBuffer;
  }

  // Validate input buffer
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
    // Write main audio to disk and verify
    await fs.promises.writeFile(mainPath, editedBuffer);
    
    // Verify the written file
    const stats = await fs.promises.stat(mainPath);
    if (stats.size === 0) {
      throw new Error(`Main audio file is empty after write`);
    }
    
    info("💾 Main audio written to disk", { sessionId, bytes: stats.size });

    // Download intro & outro (streaming with retry)
    await downloadToLocal(PODCAST_INTRO_URL, introPath, "intro", sessionId);
    await downloadToLocal(PODCAST_OUTRO_URL, outroPath, "outro", sessionId);

    let finalBuffer = null;
    let lastError = null;

    startKeepAlive(label, 15000);

    // Retry loop
    for (let attempt = 1; attempt <= MAX_PODCAST_RETRIES; attempt++) {
      try {
        // Clear previous final file
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

    // Cleanup temporary files
    await cleanupTempFiles(sessionId);

    // All attempts failed → 
