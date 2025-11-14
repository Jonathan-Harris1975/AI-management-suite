// ============================================================
// 🎙️ Podcast Editing Processor — Warm, Natural, Deeper Tone
// ============================================================
//
// • Style A: natural, intimate podcast voice
// • Local retry logic on ffmpeg
// • Saves edited audio to R2 as a safenet (editedAudio bucket)
// • Fallback to unedited merged audio if editing fails
// ============================================================

import fs from "fs";
import path from "path";
import { spawn } from "child_process";
import { info, warn, error } from "#logger.js";
import { startKeepAlive, stopKeepAlive } from "#shared/keepalive.js";
import { putObject } from "#shared/r2-client.js";

const TMP_DIR = "/tmp/tts_editing";
const EDITED_BUCKET_KEY = "editedAudio"; // R2_BUCKETS alias

const MAX_EDIT_RETRIES = Number(process.env.MAX_EDIT_RETRIES || 3);
const EDIT_RETRY_DELAY_MS = Number(process.env.EDIT_RETRY_DELAY_MS || 2000);

// Ensure /tmp editing directory exists
function ensureTmpDir() {
  if (!fs.existsSync(TMP_DIR)) {
    fs.mkdirSync(TMP_DIR, { recursive: true });
  }
}

// ------------------------------------------------------------
// 🎚️ Single ffmpeg attempt with PODCAST-SAFE enhancement filters
// ------------------------------------------------------------
//
// Filters are lean-build safe:
//  - asetrate, aresample
//  - highpass, lowpass
//  - compand, volume
// ------------------------------------------------------------
function runFfmpegPodcastEnhanceOnce(inputPath, outputPath, sessionId, attempt, total) {
  return new Promise((resolve, reject) => {
    const filterChain = [
      // Slightly deeper tone via tiny pitch drop
      "asetrate=48000*0.985,aresample=48000",

      // Clean up extremes
      "highpass=f=70",
      "lowpass=f=13500",

      // Gentle dynamics: podcast-style smoothness
      "compand=attacks=0:points=-80/-80|-40/-32|-20/-14|0/-2|20/0",

      // Small overall lift
      "volume=1.8",
    ].join(",");

    const args = [
      "-y",
      "-i",
      inputPath,
      "-af",
      filterChain,
      "-c:a",
      "libmp3lame",
      "-b:a",
      "192k",
      outputPath,
    ];

    info("🎚️ Starting podcast ffmpeg enhancement", {
      sessionId,
      attempt,
      of: total,
      args,
    });

    const ff = spawn("ffmpeg", args);

    ff.on("spawn", () => {
      info("🎬 ffmpeg (podcast enhance) spawned", { sessionId, attempt });
    });

    ff.stderr?.on("data", (chunk) => {
      const txt = chunk.toString();

      // Only escalate if there's a real error keyword
      const lower = txt.toLowerCase();
      if (lower.includes("error") || lower.includes("invalid")) {
        warn("⚠️ ffmpeg stderr reported potential problem (podcast enhance)", {
          sessionId,
          attempt,
          stderr: txt.trim(),
        });
      }
    });

    ff.on("error", (err) => {
      error("💥 ffmpeg spawn error (podcast enhance)", {
        sessionId,
        attempt,
        error: err.message,
      });
      reject(err);
    });

    ff.on("close", (code) => {
      if (code === 0) {
        info("✅ ffmpeg podcast enhancement completed", {
          sessionId,
          attempt,
          outputPath,
        });
        resolve();
      } else {
        const msg = `ffmpeg exited with code ${code}`;
        error("💥 ffmpeg closed with non-zero exit (podcast enhance)", {
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
// 🎛️ Main Editing Processor with Retry + R2 Safenet
// ============================================================
//
// Called from orchestrator as:
//   const editedBuffer = await editingProcessor(sessionId, merged);
//
// where `merged` is:
//   { key, localPath } // from mergeProcessor
// ============================================================
async function editingProcessor(sessionId, merged) {
  const label = `editingProcessor:${sessionId}`;
  ensureTmpDir();

  if (!merged || !merged.localPath) {
    throw new Error("editingProcessor: merged.localPath is required.");
  }

  const inputPath = merged.localPath;
  const editedPath = path.join(TMP_DIR, `${sessionId}_edited.mp3`);

  startKeepAlive(label, 25000);

  try {
    let success = false;
    let lastError;

    // 🔁 Local retry loop
    for (let attempt = 1; attempt <= MAX_EDIT_RETRIES; attempt++) {
      try {
        await runFfmpegPodcastEnhanceOnce(
          inputPath,
          editedPath,
          sessionId,
          attempt,
          MAX_EDIT_RETRIES
        );
        success = true;
        break;
      } catch (err) {
        lastError = err;
        if (attempt < MAX_EDIT_RETRIES) {
          warn("⚠️ editingProcessor attempt failed, will retry", {
            sessionId,
            attempt,
            maxAttempts: MAX_EDIT_RETRIES,
            error: err.message,
          });
          await new Promise((r) => setTimeout(r, EDIT_RETRY_DELAY_MS));
        }
      }
    }

    if (!success) {
      throw lastError || new Error("editingProcessor failed after all retries");
    }

    const editedBuffer = await fs.promises.readFile(editedPath);

    info("🎧 Podcast editing stage produced buffer", {
      sessionId,
      bytes: editedBuffer.length,
    });

    // 📦 Safenet: upload edited buffer to R2 (editedAudio)
    try {
      const key = `${sessionId}.mp3`;
      await putObject(EDITED_BUCKET_KEY, key, editedBuffer, "audio/mpeg");

      info("💾 Edited audio uploaded to R2 safenet (editedAudio)", {
        sessionId,
        bucketKey: EDITED_BUCKET_KEY,
        key,
        bytes: editedBuffer.length,
      });
    } catch (uploadErr) {
      warn("⚠️ Failed to upload edited audio to R2 safenet", {
        sessionId,
        bucketKey: EDITED_BUCKET_KEY,
        error: uploadErr.message,
      });
      // Non-fatal: we still return the edited buffer
    }

    stopKeepAlive(label);
    return editedBuffer;
  } catch (err) {
    error("💥 editingProcessor failed — using fallback audio", {
      sessionId,
      error: err.message,
    });

    // Fallback to unedited merged audio
    try {
      const fallbackBuffer = await fs.promises.readFile(inputPath);

      warn("⚠️ Using unedited merged audio fallback", {
        sessionId,
        bytes: fallbackBuffer.length,
      });

      stopKeepAlive(label);
      return fallbackBuffer;
    } catch (fallbackErr) {
      error("💥 editingProcessor fallback also failed", {
        sessionId,
        error: fallbackErr.message,
      });

      stopKeepAlive(label);
      throw fallbackErr;
    }
  }
}

export { editingProcessor };
export default editingProcessor;
