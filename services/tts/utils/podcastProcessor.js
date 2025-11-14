// ============================================================
// 🎵 Podcast Processor — Intro/Outro Mixdown & Final Mastering
// ============================================================
//
// Signature:
//   const finalAudio = await podcastProcessor(sessionId, editedBuffer);
//
// • Mixes PODCAST_INTRO_URL + editedBuffer + PODCAST_OUTRO_URL
// • Uses ffmpeg concat filter
// • Local retry logic on ffmpeg
// • Falls back to editedBuffer if mixing fails
// ============================================================

import fs from "fs";
import path from "path";
import { spawn } from "child_process";
import { info, warn, error } from "#logger.js";
import { startKeepAlive, stopKeepAlive } from "#shared/keepalive.js";

const TMP_DIR = "/tmp/podcast_final";

const PODCAST_INTRO_URL = process.env.PODCAST_INTRO_URL || "";
const PODCAST_OUTRO_URL = process.env.PODCAST_OUTRO_URL || "";

const MAX_PODCAST_RETRIES = Number(process.env.MAX_PODCAST_RETRIES || 3);
const PODCAST_RETRY_DELAY_MS = Number(process.env.PODCAST_RETRY_DELAY_MS || 3000);

// Ensure /tmp directory exists
function ensureTmpDir() {
  if (!fs.existsSync(TMP_DIR)) {
    fs.mkdirSync(TMP_DIR, { recursive: true });
  }
}

// ------------------------------------------------------------
// 🧪 Single ffmpeg attempt to mix intro → main → outro
// ------------------------------------------------------------
function runPodcastMixdownOnce(sessionId, mainPath, outputPath, attempt, total) {
  return new Promise((resolve, reject) => {
    // We assume both intro & outro are available; if they aren't,
    // the caller will short-circuit and just return editedBuffer.
    const args = [
      "-y",
      "-i",
      PODCAST_INTRO_URL,
      "-i",
      mainPath,
      "-i",
      PODCAST_OUTRO_URL,
      "-filter_complex",
      "[0:a][1:a][2:a]concat=n=3:v=0:a=1[a]",
      "-map",
      "[a]",
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
          outputPath,
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

  startKeepAlive(label, 30000);

  const mainPath = path.join(TMP_DIR, `${sessionId}_main.mp3`);
  const finalPath = path.join(TMP_DIR, `${sessionId}_final.mp3`);

  try {
    await fs.promises.writeFile(mainPath, editedBuffer);

    let success = false;
    let lastError;
    let finalBuffer = null;

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
        if (attempt < MAX_PODCAST_RETRIES) {
          warn("⚠️ podcastProcessor attempt failed, will retry", {
            sessionId,
            attempt,
            maxAttempts: MAX_PODCAST_RETRIES,
            error: err.message,
          });
          await new Promise((r) => setTimeout(r, PODCAST_RETRY_DELAY_MS));
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
