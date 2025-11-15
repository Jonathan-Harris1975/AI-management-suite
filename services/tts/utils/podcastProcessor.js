// ============================================================
// 🎵 Modular Podcast Processor
// ============================================================
// Four-step pipeline:
//   1. Normalize intro/outro to 48kHz mono s16 (temp memory)
//   2. Normalize main edit MP3 to 48kHz mono s16 (temp memory)
//   3. Apply fade in/out effects
//   4. Apply audio effects (compression + loudnorm)
// ============================================================

import fs from "fs";
import path from "path";
import { spawn } from "child_process";
import { info, warn, error } from "#logger.js";
import { startKeepAlive, stopKeepAlive } from "#shared/keepalive.js";
import { putObject } from "#shared/r2-client.js";

// ============================================================
// Configuration
// ============================================================
const TMP_DIR = "/tmp/podcast_master";
const MIN_VALID_BYTES = 10 * 1024; // 10 KB

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
// Utility: Execute FFmpeg with timeout and retries
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
        reject(new Error(`ffmpeg failed (code ${code}): ${stderr}`));
      }
    });
  });
}

// ============================================================
// Utility: Download remote file
// ============================================================
async function downloadToLocal(url, targetPath, label) {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to download ${label}: HTTP ${res.status}`);
  }

  const buf = Buffer.from(await res.arrayBuffer());

  if (buf.length < MIN_VALID_BYTES) {
    throw new Error(`${label} MP3 too small or invalid (bytes=${buf.length})`);
  }

  await fs.promises.writeFile(targetPath, buf);
  info(`⬇️ Downloaded ${label}`, { bytes: buf.length, targetPath });

  return buf;
}

// ============================================================
// STEP 1: Normalize intro/outro to 48kHz mono s16
// ============================================================
async function normalizeIntroOutro(sessionId, introPath, outroPath) {
  info("🔧 STEP 1: Normalizing intro/outro to 48kHz mono s16", { sessionId });

  const introNormPath = path.join(TMP_DIR, `${sessionId}_intro_norm.wav`);
  const outroNormPath = path.join(TMP_DIR, `${sessionId}_outro_norm.wav`);

  // Normalize intro
  await runFFmpeg(
    [
      "-y",
      "-xerror",
      "-i",
      introPath,
      "-ar",
      "48000",
      "-ac",
      "1",
      "-sample_fmt",
      "s16",
      "-acodec",
      "pcm_s16le",
      introNormPath,
    ],
    "normalize-intro",
    sessionId
  );

  // Normalize outro
  await runFFmpeg(
    [
      "-y",
      "-xerror",
      "-i",
      outroPath,
      "-ar",
      "48000",
      "-ac",
      "1",
      "-sample_fmt",
      "s16",
      "-acodec",
      "pcm_s16le",
      outroNormPath,
    ],
    "normalize-outro",
    sessionId
  );

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

  await runFFmpeg(
    [
      "-y",
      "-xerror",
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
      mainNormPath,
    ],
    "normalize-main",
    sessionId
  );

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

  info("✅ STEP 4 complete: Audio effects applied", { sessionId, outputPath });
}

// ============================================================
// Pipeline orchestrator with retries
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

  const introPath = path.join(TMP_DIR, `${sessionId}_intro.mp3`);
  const mainPath = path.join(TMP_DIR, `${sessionId}_main.mp3`);
  const outroPath = path.join(TMP_DIR, `${sessionId}_outro.mp3`);
  const finalPath = path.join(TMP_DIR, `${sessionId}_final.mp3`);

  try {
    // Write main audio to disk
    await fs.promises.writeFile(mainPath, editedBuffer);

    // Download intro & outro
    await downloadToLocal(PODCAST_INTRO_URL, introPath, "intro");
    await downloadToLocal(PODCAST_OUTRO_URL, outroPath, "outro");

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

        if (candidate.length < MIN_VALID_BYTES) {
          throw new Error(
            `Final MP3 too small or invalid (bytes=${candidate.length})`
          );
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

    // Cleanup final file
    try {
      await fs.promises.unlink(finalPath);
    } catch {}

    // All attempts failed → return editedBuffer unchanged
    if (!finalBuffer) {
      error("💥 podcastProcessor failed after all retries", {
        sessionId,
        error: lastError?.message,
      });
      return editedBuffer;
    }

    // Safenet upload
    if (EDITED_BUCKET && PUBLIC_EDITED_BASE) {
      try {
        const key = `${sessionId}_final.mp3`;

        await putObject(EDITED_BUCKET, key, finalBuffer, "audio/mpeg");

        info("💾 podcastProcessor safenet upload OK", {
          sessionId,
          bucket: EDITED_BUCKET,
          key,
          url: `${PUBLIC_EDITED_BASE}/${encodeURIComponent(key)}`,
        });
      } catch (err) {
        warn("⚠️ podcastProcessor safenet upload failed", {
          sessionId,
          error: err.message,
        });
      }
    }

    return finalBuffer;
  } catch (err) {
    stopKeepAlive(label);

    error("💥 podcastProcessor crashed", {
      sessionId,
      error: err.message,
    });

    return editedBuffer;
  }
}

export default podcastProcessor;
