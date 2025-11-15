// 🎙️ STAGED Editing Processor — Podcast-Ready Version
// Breaks processing into stages to avoid starting over on failure
// Cleans up tmp files as we go
// ============================================================

import fs from "fs";
import path from "path";
import { spawn } from "child_process";
import { log } from "#logger.js";
import { startKeepAlive, stopKeepAlive } from "#shared/keepalive.js";
import { uploadBuffer } from "#shared/r2-client.js";

const TMP_DIR = "/tmp/tts_editing";

function ensureTmpDir() {
  if (!fs.existsSync(TMP_DIR)) {
    fs.mkdirSync(TMP_DIR, { recursive: true });
  }
}

// ------------------------------------------------------------
// 🔧 Helper: Run FFmpeg Stage
// ------------------------------------------------------------
async function runFFmpegStage(sessionId, inputPath, outputPath, filterStr, description) {
  log.info(`🎚️ Starting stage: ${description}`, { sessionId });

  return new Promise((resolve, reject) => {
    const ffmpeg = spawn("ffmpeg", [
      "-hide_banner",
      "-loglevel",
      "error",
      "-i",
      inputPath,
      "-af",
      filterStr,
      "-ar", "44100",
      "-codec:a", "libmp3lame",
      "-b:a", "192k",
      "-y",
      outputPath,
    ]);

    let ffmpegErr = "";
    let settled = false;

    ffmpeg.stderr.on("data", (d) => (ffmpegErr += d.toString()));

    ffmpeg.on("error", (err) => {
      if (settled) return;
      settled = true;
      reject(err);
    });

    ffmpeg.on("close", (code) => {
      if (settled) return;
      settled = true;

      if (code !== 0) {
        reject(new Error(`${description} failed with code ${code}: ${ffmpegErr}`));
      } else {
        // Validate output
        if (!fs.existsSync(outputPath)) {
          reject(new Error(`${description}: Output file not created`));
          return;
        }

        const stats = fs.statSync(outputPath);
        if (!stats.size) {
          reject(new Error(`${description}: Output file is empty`));
          return;
        }

        log.info(`✅ Completed stage: ${description}`, { sessionId, size: stats.size });
        resolve(outputPath);
      }
    });
  });
}

// ------------------------------------------------------------
// 🧩 Staged Editing Processor
// ------------------------------------------------------------
export async function editingProcessor(sessionId, inputPathObj) {
  startKeepAlive(`editingProcessor:${sessionId}`, 25000);
  ensureTmpDir();

  const inputPath =
    typeof inputPathObj === "string"
      ? inputPathObj
      : inputPathObj?.localPath;

  if (!inputPath || typeof inputPath !== "string") {
    stopKeepAlive();
    throw new Error(
      `Invalid inputPath passed to editingProcessor. Received: ${JSON.stringify(
        inputPathObj
      )}`
    );
  }

  if (!fs.existsSync(inputPath)) {
    stopKeepAlive();
    throw new Error(`Input file does not exist: ${inputPath}`);
  }

  const stats = fs.statSync(inputPath);
  if (!stats.size) {
    stopKeepAlive();
    throw new Error(`Input file is empty: ${inputPath}`);
  }

  log.info("🎚️ Starting staged editingProcessor (Podcast-Ready)", { sessionId, inputPath });

  // Stage file paths
  const stage1Path = path.join(TMP_DIR, `${sessionId}_stage1_pitch.mp3`);
  const stage2Path = path.join(TMP_DIR, `${sessionId}_stage2_eq.mp3`);
  const stage3Path = path.join(TMP_DIR, `${sessionId}_stage3_deess.mp3`);
  const finalPath = path.join(TMP_DIR, `${sessionId}_edited.mp3`);

  const stagePaths = [stage1Path, stage2Path, stage3Path, finalPath];

  // Clean up any existing stage files
  for (const stagePath of stagePaths) {
    if (fs.existsSync(stagePath)) {
      try {
        fs.unlinkSync(stagePath);
        log.info("🧹 Cleaned up existing stage file", { sessionId, path: stagePath });
      } catch (cleanupErr) {
        log.warn("⚠️ Could not clean up existing stage file", { 
          sessionId, 
          path: stagePath,
          error: cleanupErr.message 
        });
      }
    }
  }

  let currentInput = inputPath;
  let lastSuccessfulStage = null;

  try {
    // ------------------------------------------------------------
    // STAGE 1: Pitch Shift (slowest operation)
    // ------------------------------------------------------------
    currentInput = await runFFmpegStage(
      sessionId,
      currentInput,
      stage1Path,
      "rubberband=pitch=0.89:tempo=1.0",
      "Stage 1: Pitch Shift (Rubberband)"
    );
    lastSuccessfulStage = stage1Path;

    // ------------------------------------------------------------
    // STAGE 2: EQ (bass boost + harshness reduction)
    // ------------------------------------------------------------
    const eqFilters = [
      "equalizer=f=80:t=q:w=1.2:g=4",
      "equalizer=f=150:t=q:w=1.1:g=3.5",
      "equalizer=f=250:t=q:w=1.0:g=2.5",
      "equalizer=f=3000:t=q:w=2.0:g=-2.5",
      "equalizer=f=6000:t=q:w=2.0:g=-3",
      "equalizer=f=8500:t=h:g=-2",
      "equalizer=f=2200:t=q:w=1.5:g=1.5",
    ].join(",");

    currentInput = await runFFmpegStage(
      sessionId,
      currentInput,
      stage2Path,
      eqFilters,
      "Stage 2: EQ Processing"
    );

    // Clean up previous stage
    if (lastSuccessfulStage && fs.existsSync(lastSuccessfulStage)) {
      fs.unlinkSync(lastSuccessfulStage);
      log.info("🧹 Cleaned up previous stage", { sessionId, path: lastSuccessfulStage });
    }
    lastSuccessfulStage = stage2Path;

    // ------------------------------------------------------------
    // STAGE 3: De-esser
    // ------------------------------------------------------------
    currentInput = await runFFmpegStage(
      sessionId,
      currentInput,
      stage3Path,
      "deesser=i=0.4:m=0.75:f=0.5",
      "Stage 3: De-esser"
    );

    // Clean up previous stage
    if (lastSuccessfulStage && fs.existsSync(lastSuccessfulStage)) {
      fs.unlinkSync(lastSuccessfulStage);
      log.info("🧹 Cleaned up previous stage", { sessionId, path: lastSuccessfulStage });
    }
    lastSuccessfulStage = stage3Path;

    // ------------------------------------------------------------
    // STAGE 4: Compression + Limiting (final)
    // ------------------------------------------------------------
    const dynamicsFilters = [
      "acompressor=threshold=-20dB:ratio=4:attack=15:release=250:makeup=3",
      "alimiter=limit=0.95:attack=5:release=100"
    ].join(",");

    currentInput = await runFFmpegStage(
      sessionId,
      currentInput,
      finalPath,
      dynamicsFilters,
      "Stage 4: Compression + Limiting"
    );

    // Clean up previous stage
    if (lastSuccessfulStage && fs.existsSync(lastSuccessfulStage)) {
      fs.unlinkSync(lastSuccessfulStage);
      log.info("🧹 Cleaned up previous stage", { sessionId, path: lastSuccessfulStage });
    }

    // Upload final result
    const buffer = fs.readFileSync(finalPath);
    const key = `${sessionId}_edited.mp3`;

    await uploadBuffer("editedAudio", key, buffer, "audio/mpeg");

    log.info("💾 Uploaded edited MP3 to R2 (Podcast-Ready)", { 
      sessionId, 
      key, 
      size: buffer.length 
    });

    stopKeepAlive();
    return finalPath;

  } catch (err) {
    log.error("💥 editingProcessor stage failed", { 
      sessionId, 
      error: err.message,
      lastSuccessfulStage: lastSuccessfulStage || 'none'
    });

    // Fallback: use original or last successful stage
    try {
      const fallbackPath = lastSuccessfulStage || inputPath;
      const fallbackBuffer = fs.readFileSync(fallbackPath);
      const key = `${sessionId}_edited.mp3`;

      await uploadBuffer("merged", key, fallbackBuffer, "audio/mpeg");

      log.info("💾 Uploaded fallback audio to R2", { 
        sessionId, 
        key, 
        fallback: true,
        source: lastSuccessfulStage ? 'last successful stage' : 'original'
      });

      // Copy to expected final location if needed
      if (fallbackPath !== finalPath) {
        fs.copyFileSync(fallbackPath, finalPath);
      }

      stopKeepAlive();
      return finalPath;

    } catch (fallbackErr) {
      log.error("💥 editingProcessor fallback also failed", { 
        sessionId, 
        error: fallbackErr.message 
      });
      stopKeepAlive();
      throw fallbackErr;
    }
  } finally {
    // Final cleanup of any remaining stage files
    for (const stagePath of stagePaths) {
      if (stagePath !== finalPath && fs.existsSync(stagePath)) {
        try {
          fs.unlinkSync(stagePath);
          log.info("🧹 Final cleanup of stage file", { sessionId, path: stagePath });
        } catch (cleanupErr) {
          log.warn("⚠️ Could not clean up stage file in finally", { 
            sessionId, 
            path: stagePath,
            error: cleanupErr.message 
          });
        }
      }
    }
  }
}

export default editingProcessor;
