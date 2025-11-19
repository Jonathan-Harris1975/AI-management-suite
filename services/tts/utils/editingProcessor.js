// 🎙️ STAGED Editing Processor — Optimised & Split EQ Version
// ============================================================

import fs from "fs";
import path from "path";
import { spawn } from "child_process";
import { log } from "#logger.js";
import { startKeepAlive, stopKeepAlive } from "#shared/keepalive.js";
import { uploadBuffer } from "#shared/r2-client.js";

const TMP_DIR = "/tmp/tts_editing";

// ------------------------------------------------------------
// Ensure tmp exists
// ------------------------------------------------------------
function ensureTmpDir() {
  if (!fs.existsSync(TMP_DIR)) {
    fs.mkdirSync(TMP_DIR, { recursive: true });
  }
}

// ------------------------------------------------------------
// Run FFmpeg Stage
// ------------------------------------------------------------
async function runFFmpegStage(sessionId, inputPath, outputPath, filterStr, description) {
  log.info(`🎚️ Starting stage: ${description}`, { sessionId });

  return new Promise((resolve, reject) => {
    const ffmpeg = spawn("ffmpeg", [
      "-hide_banner",
      "-loglevel", "error",
      "-i", inputPath,
      "-af", filterStr,
      "-ar", "44100",
      "-codec:a", "libmp3lame",
      "-b:a", "192k",
      "-y",
      outputPath,
    ]);

    let ffmpegErr = "";
    let done = false;

    ffmpeg.stderr.on("data", (d) => (ffmpegErr += d.toString()));

    ffmpeg.on("error", (err) => {
      if (done) return;
      done = true;
      reject(err);
    });

    ffmpeg.on("close", (code) => {
      if (done) return;
      done = true;

      if (code !== 0) {
        reject(new Error(`${description} failed with code ${code}: ${ffmpegErr}`));
        return;
      }

      if (!fs.existsSync(outputPath)) {
        reject(new Error(`${description}: Output file missing`));
        return;
      }

      const stats = fs.statSync(outputPath);
      if (!stats.size) {
        reject(new Error(`${description}: Output file empty`));
        return;
      }

      log.info(`✅ Completed stage: ${description}`, { sessionId, size: stats.size });
      resolve(outputPath);
    });
  });
}

// ------------------------------------------------------------
// 🧩 Main Editing Processor
// ------------------------------------------------------------
export async function editingProcessor(sessionId, inputPathObj) {
  startKeepAlive(`editingProcessor:${sessionId}`, 25000);
  ensureTmpDir();

  const inputPath =
    typeof inputPathObj === "string"
      ? inputPathObj
      : inputPathObj?.localPath;

  if (!inputPath || !fs.existsSync(inputPath)) {
    stopKeepAlive();
    throw new Error(`Invalid input file: ${JSON.stringify(inputPathObj)}`);
  }

  const sizeCheck = fs.statSync(inputPath);
  if (!sizeCheck.size) {
    stopKeepAlive();
    throw new Error(`Input file is empty: ${inputPath}`);
  }

  log.info("🎚️ Starting optimised editingProcessor", { sessionId, inputPath });

  // ------------------------------------------------------------
  // Stage File Paths
  // ------------------------------------------------------------
  const stage1Path = path.join(TMP_DIR, `${sessionId}_stage1_pitch.mp3`);
  const stage2APath = path.join(TMP_DIR, `${sessionId}_stage2A_eq_lowmid.mp3`);
  const stage2BPath = path.join(TMP_DIR, `${sessionId}_stage2B_eq_high.mp3`);
  const stage3Path = path.join(TMP_DIR, `${sessionId}_stage3_deess.mp3`);
  const stage4Path = path.join(TMP_DIR, `${sessionId}_stage4_dynamics.mp3`);
  const stage5Path = path.join(TMP_DIR, `${sessionId}_stage5_stereo.mp3`);
  const finalPath = path.join(TMP_DIR, `${sessionId}_edited.mp3`);

  const allStages = [
    stage1Path,
    stage2APath,
    stage2BPath,
    stage3Path,
    stage4Path,
    stage5Path,
    finalPath,
  ];

  // ------------------------------------------------------------
  // Cleanup any leftover temp stage files
  // ------------------------------------------------------------
  for (const p of allStages) {
    if (fs.existsSync(p)) {
      try {
        fs.unlinkSync(p);
        log.debug("🧹 Removed existing stage file", { sessionId, path: p });
      } catch (e) {
        log.warn("⚠️ Could not remove leftover stage file", {
          sessionId,
          path: p,
          error: e.message,
        });
      }
    }
  }

  let currentInput = inputPath;
  let lastGood = null;

  try {
    // ------------------------------------------------------------
    // STAGE 1: Pitch Shift
    // ------------------------------------------------------------
    currentInput = await runFFmpegStage(
      sessionId,
      currentInput,
      stage1Path,
      "rubberband=pitch=0.92:tempo=1.0",
      "Stage 1: 🗣️ Pitch Shift"
    );
    lastGood = stage1Path;

    // ------------------------------------------------------------
    // STAGE 2A: EQ — Low-End + Low-Mids
    // ------------------------------------------------------------
    const eq2A = [
      "equalizer=f=80:t=q:w=1.2:g=4",
      "equalizer=f=150:t=q:w=1.1:g=3.5",
      "equalizer=f=250:t=q:w=1.0:g=2.5"
    ].join(",");

    currentInput = await runFFmpegStage(
      sessionId,
      currentInput,
      stage2APath,
      eq2A,
      "Stage 2A: 🎛️ EQ Low-End + Low-Mids"
    );
    if (lastGood && fs.existsSync(lastGood)) fs.unlinkSync(lastGood);
    lastGood = stage2APath;

    // ------------------------------------------------------------
    // STAGE 2B: EQ — High-End + Presence
    // ------------------------------------------------------------
    const eq2B = [
      "equalizer=f=3000:t=q:w=2.0:g=-2.5",
      "equalizer=f=6000:t=q:w=2.0:g=-3",
      "equalizer=f=8500:t=h:g=-2",
      "equalizer=f=2200:t=q:w=1.5:g=1.5"
    ].join(",");

    currentInput = await runFFmpegStage(
      sessionId,
      currentInput,
      stage2BPath,
      eq2B,
      "Stage 2B: 🎛️ EQ High-End + Presence"
    );
    if (lastGood && fs.existsSync(lastGood)) fs.unlinkSync(lastGood);
    lastGood = stage2BPath;

    // ------------------------------------------------------------
    // STAGE 3: De-esser
    // ------------------------------------------------------------
    currentInput = await runFFmpegStage(
      sessionId,
      currentInput,
      stage3Path,
      "deesser=i=0.4:m=0.75:f=0.5",
      "Stage 3: 🎛️ De-esser"
    );
    if (lastGood && fs.existsSync(lastGood)) fs.unlinkSync(lastGood);
    lastGood = stage3Path;

    // ------------------------------------------------------------
    // STAGE 4: Compression + Limiting
    // ------------------------------------------------------------
    const dyn = [
      "acompressor=threshold=-20dB:ratio=4:attack=15:release=250:makeup=3",
      "alimiter=limit=0.95:attack=5:release=100"
    ].join(",");

    currentInput = await runFFmpegStage(
      sessionId,
      currentInput,
      stage4Path,
      dyn,
      "Stage 4: 🎛️ Compression & Limiter"
    );
    if (lastGood && fs.existsSync(lastGood)) fs.unlinkSync(lastGood);
    lastGood = stage4Path;

    // ------------------------------------------------------------
    // STAGE 5: Mono → Stereo
    // ------------------------------------------------------------
    currentInput = await runFFmpegStage(
      sessionId,
      currentInput,
      stage5Path,
      "pan=stereo|c0=c0|c1=c0",
      "Stage 5: 🔊 Mono → Stereo"
    );
    if (lastGood && fs.existsSync(lastGood)) fs.unlinkSync(lastGood);
    lastGood = stage5Path;

    // ------------------------------------------------------------
    // FINAL OUTPUT
    // ------------------------------------------------------------
    fs.copyFileSync(stage5Path, finalPath);

    const buffer = fs.readFileSync(finalPath);
    const key = `${sessionId}_edited.mp3`;

    await uploadBuffer("editedAudio", key, buffer, "audio/mpeg");

    log.info("💾 Uploaded edited MP3 to R2", {
      sessionId,
      key,
      size: buffer.length,
    });

    stopKeepAlive();
    return finalPath;

  } catch (err) {
    log.error("💥 editingProcessor failed", {
      sessionId,
      error: err.message,
      lastSuccessfulStage: lastGood || "none",
    });

    // Fallback upload
    try {
      const fallback = lastGood || inputPath;
      const buf = fs.readFileSync(fallback);
      const key = `${sessionId}_edited.mp3`;

      await uploadBuffer("editedAudio", key, buf, "audio/mpeg");
      fs.copyFileSync(fallback, finalPath);

      stopKeepAlive();
      return finalPath;
    } catch (e) {
      log.error("💥 Fallback failed", { sessionId, error: e.message });
      stopKeepAlive();
      throw e;
    }
  } finally {
    // ------------------------------------------------------------
    // Final Cleanup of All Stage Files
    // ------------------------------------------------------------
    for (const p of allStages) {
      if (p !== finalPath && fs.existsSync(p)) {
        try {
          fs.unlinkSync(p);
          log.debug("🧹 Cleanup", { sessionId, path: p });
        } catch (e) {
          log.warn("⚠️ Cleanup failed", { sessionId, path: p });
        }
      }
    }
  }
}

export default editingProcessor;
