// ============================================================
// 🎵 Podcast Processor — Intro/Outro Mixdown & Final Mastering
// ============================================================
//
// Signature:
//   const finalAudio = await podcastProcessor(sessionId, editedBuffer);
//
// • Mixes PODCAST_INTRO_URL + editedBuffer + PODCAST_OUTRO_URL
// • Fades intro in & outro out using MIN_INTRO_DURATION / MIN_OUTRO_DURATION
// • Applies loudnorm + gentle compression (Pro Podcast preset)
// • Local retry logic with exponential backoff
// • Saves final mastered file to R2_BUCKET_EDITED_AUDIO as safenet
// • Falls back to editedBuffer if mixing fails
// ============================================================

import fs from "fs";
import path from "path";
import { spawn } from "child_process";
import { info, warn, error } from "#logger.js";
import { startKeepAlive, stopKeepAlive } from "#shared/keepalive.js";
import { putObject } from "#shared/r2-client.js";

// ------------------------------------------------------------
// ⚙️ Environment
// ------------------------------------------------------------
const TMP_DIR = "/tmp/podcast_final";

const PODCAST_INTRO_URL = process.env.PODCAST_INTRO_URL || "";
const PODCAST_OUTRO_URL = process.env.PODCAST_OUTRO_URL || "";

// Fade durations (seconds) — from env, with sane defaults
const MIN_INTRO_DURATION = Number(process.env.MIN_INTRO_DURATION || 3);
const MIN_OUTRO_DURATION = Number(process.env.MIN_OUTRO_DURATION || 3);

const INTRO_FADE_SEC = Number.isFinite(MIN_INTRO_DURATION)
  ? Math.max(0.1, MIN_INTRO_DURATION)
  : 3;

const OUTRO_FADE_SEC = Number.isFinite(MIN_OUTRO_DURATION)
  ? Math.max(0.1, MIN_OUTRO_DURATION)
  : 3;

// Retry settings (shared envs)
const MAX_PODCAST_RETRIES = Number(process.env.MAX_CHUNK_RETRIES || 3);
const PODCAST_RETRY_DELAY_MS = Number(process.env.RETRY_DELAY_MS || 2000);
const PODCAST_RETRY_BACKOFF =
  Number(process.env.RETRY_BACKOFF_MULTIPLIER || 2);

// Edited audio safenet bucket
const EDITED_BUCKET = process.env.R2_BUCKET_EDITED_AUDIO || "";
const PUBLIC_EDITED_BASE = process.env.R2_PUBLIC_BASE_URL_EDITED_AUDIO || "";

// Ensure /tmp directory exists
function ensureTmpDir() {
  if (!fs.existsSync(TMP_DIR)) {
    fs.mkdirSync(TMP_DIR, { recursive: true });
  }
}

// ------------------------------------------------------------
// 🧪 Single ffmpeg attempt to mix intro → main → outro
//      + fades + loudnorm + compression
// ------------------------------------------------------------
function runPodcastMixdownOnce(
  sessionId,
  mainPath,
  outputPath,
  attempt,
  total
) {
  return new Promise((resolve, reject) => {
    // If intro/outro not configured, this function should not be called.
    // Caller will short-circuit and use editedBuffer directly.
    const filterComplex = [
      // Intro: fade in from start
      `[0:a]afade=t=in:d=${INTRO_FADE_SEC}[intro]`,

      // Outro: fade out at end using reverse trick
      `[2:a]areverse,afade=t=in:d=${OUTRO_FADE_SEC},areverse[outro]`,

      // Concatenate: intro → main → outro
      `[intro][1:a][outro]concat=n=3:v=0:a=1[pre]`,

      // Pro-podcast mastering: loudnorm + gentle compression
      `[pre]` +
        `loudnorm=I=-16:LRA=11:TP=-1.5:print_format=summary,` +
        `acompressor=threshold=-18dB:ratio=3:attack=5:release=50[master]`,
    ].join(";");

    const args = [
      "-y",
      "-i",
      PODCAST_INTRO_URL,
      "-i",
      mainPath,
      "-i",
      PODCAST_OUTRO_URL,
      "-filter_complex",
      filterComplex,
      "-map",
      "[master]",
      "-c:a",
      "libmp3lame",
      "-b:a",
      "192k",
      outputPath,
    ];

    info("🎵 Starting podcast mixdown ffmpeg", {
      sessionId,
      attempt,
      of: total,
      args,
    });

    const ff = spawn("ffmpeg", args);

    ff.on("spawn", () => {
      info("🎬 ffmpeg (podcast mixdown) spawned", {
        sessionId,
        attempt,
      });
    });

    ff.stderr?.on("data", (chunk) => {
      const txt = chunk.toString();
      const lower = txt.toLowerCase();

      if (lower.includes("error") || lower.includes("invalid")) {
        warn("⚠️ ffmpeg stderr reported potential problem (podcast mixdown)", {
          sessionId,
          attempt,
          stderr: txt.trim(),
        });
      }
    });

    ff.on("error", (err) => {
      error("💥 ffmpeg spawn error (podcast mixdown)", {
        sessionId,
        attempt,
        error: err.message,
      });
      reject(err);
    });

    ff.on("close", (code) => {
      if (code === 0) {
        info("✅ ffmpeg podcast mixdown completed", {
          sessionId,
          attempt,
        });
        resolve();
      } else {
        const msg = `ffmpeg exited with code ${code}`;
        error("💥 ffmpeg closed with non-zero exit (podcast mixdown)", {
          sessionId,
          attempt,
          code,
        });
        reject(new Error(msg));
      }
    });
  });
}

// ============================================================
// 🎛️ Main Podcast Processor with Retry + Fallback
// ============================================================
//
// If intro/outro URLs are missing, or all ffmpeg attempts fail,
// we fall back to returning `editedBuffer` so the pipeline still
// produces a usable episode.
// ============================================================
export async function podcastProcessor(sessionId, editedBuffer) {
  const label = `podcastProcessor:${sessionId}`;
  ensureTmpDir();

  // If no intro/outro configured, just return editedBuffer directly
  if (!PODCAST_INTRO_URL && !PODCAST_OUTRO_URL) {
    warn("⚠️ No PODCAST_INTRO_URL or PODCAST_OUTRO_URL set, skipping mixdown", {
      sessionId,
    });
    return editedBuffer;
  }

  const mainPath = path.join(TMP_DIR, `${sessionId}_main.mp3`);
  const finalPath = path.join(TMP_DIR, `${sessionId}_final.mp3`);

  try {
    await fs.promises.writeFile(mainPath, editedBuffer);

    let success = false;
    let lastError;
    let finalBuffer = null;

    startKeepAlive(label, { intervalMs: 15000 });

    for (let attempt = 1; attempt <= MAX_PODCAST_RETRIES; attempt++) {
      try {
        await runPodcastMixdownOnce(
          sessionId,
          mainPath,
          finalPath,
          attempt,
          MAX_PODCAST_RETRIES
        );

        finalBuffer = await fs.promises.readFile(finalPath);
        success = true;
        break;
      } catch (err) {
        lastError = err;

        warn("⚠️ podcastProcessor ffmpeg attempt failed", {
          sessionId,
          attempt,
          maxAttempts: MAX_PODCAST_RETRIES,
          error: err.message,
        });

        if (attempt < MAX_PODCAST_RETRIES) {
          const delay =
            PODCAST_RETRY_DELAY_MS *
            Math.pow(PODCAST_RETRY_BACKOFF, attempt - 1);

          info("🔁 Retrying podcast mixdown after delay", {
            sessionId,
            attempt,
            nextInMs: delay,
          });

          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }

    if (!success || !finalBuffer?.length) {
      // All attempts failed — fall back to editedBuffer
      warn(
        "⚠️ podcastProcessor failed after all retries, falling back to edited audio without intro/outro",
        {
          sessionId,
          error: lastError?.message,
        }
      );

      stopKeepAlive(label);
      return editedBuffer;
    }

    info("🎚️ Podcast mixdown produced final buffer", {
      sessionId,
      bytes: finalBuffer.length,
    });

    // 📦 Safenet: upload final mastered buffer to edited-audio bucket (if configured)
    if (EDITED_BUCKET && PUBLIC_EDITED_BASE) {
      try {
        const key = `${sessionId}.mp3`;
        await putObject(EDITED_BUCKET, key, finalBuffer, "audio/mpeg");

        const url = `${PUBLIC_EDITED_BASE}/${encodeURIComponent(key)}`;

        info("💾 Final mastered podcast uploaded to edited-audio bucket", {
          sessionId,
          bucket: EDITED_BUCKET,
          key,
          url,
          bytes: finalBuffer.length,
        });
      } catch (uploadErr) {
        warn("⚠️ Failed to upload final mastered podcast to edited-audio bucket", {
          sessionId,
          error: uploadErr.message,
        });
      }
    }

    stopKeepAlive(label);
    return finalBuffer;
  } catch (err) {
    // On unexpected failure, still fall back to editedBuffer
    error("💥 podcastProcessor unexpected failure — using editedBuffer fallback", {
      sessionId,
      error: err.message,
    });

    stopKeepAlive(label);
    return editedBuffer;
  }
}

export default podcastProcessor;
