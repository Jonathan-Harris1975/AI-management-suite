// 🎙️ STAGED Editing Processor — Optimised Split-Version
// ============================================================
// Pipeline:
//   1: Pitch Shift
//   2A: Low-End + Low-Mids EQ
//   2B: High-End + Presence EQ
//   3: De-Esser
//   4A: Compressor
//   4B: Limiter
//   5: Mono → Stereo
//   6: Subtle Fade In/Out (3.0s)
//   7: Final copy + upload to R2 ("editedAudio")
// ============================================================

import fs from "fs";
import path from "path";
import { spawn, spawnSync } from "child_process";
import { log } from "#logger.js";
import { startKeepAlive, stopKeepAlive } from "#shared/keepalive.js";
import { uploadBuffer } from "#shared/r2-client.js";

const TMP_DIR = "/tmp/tts_editing";
const VOICE_FADE_SECONDS = 3.0; // 3-second fades

function ensureTmpDir() {
  if (!fs.existsSync(TMP_DIR)) {
    fs.mkdirSync(TMP_DIR, { recursive: true });
  }
}

async function runFFmpegStage(sessionId, inputPath, outputPath, filterStr, description) {
  log.info(`🎚️ Starting: ${description}`, { sessionId });

  return new Promise((resolve, reject) => {
    const ffmpeg = spawn("ffmpeg", [
      "-hide_banner",
      "-loglevel",
      "error",
      "-i",
      inputPath,
      "-af",
      filterStr,
      "-ar",
      "44100",
      "-codec:a",
      "libmp3lame",
      "-b:a",
      "192k",
      "-y",
      outputPath,
    ]);

    let ffmpegErr = "";
    let settled = false;

    ffmpeg.stderr.on("data", (d) => {
      ffmpegErr += d.toString();
    });

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
        return;
      }

      if (!fs.existsSync(outputPath)) {
        reject(new Error(`${description}: Output file not created`));
        return;
      }

      const stats = fs.statSync(outputPath);
      if (!stats.size) {
        reject(new Error(`${description}: Output file is empty`));
        return;
      }

      log.info(`✅ Completed : ${description}`, {
        sessionId,
        size: stats.size,
        outputPath,
      });
      resolve(outputPath);
    });
  });
}

function safeFileCleanup(sessionId, filePath, description) {
  if (filePath && fs.existsSync(filePath)) {
    try {
      fs.unlinkSync(filePath);
      log.info("🧹 Cleaned up previous stage file", {
        sessionId,
        path: filePath,
        description
      });
    } catch (cleanupErr) {
      log.warn("⚠️ Could not clean up previous stage file", {
        sessionId,
        path: filePath,
        error: cleanupErr.message,
        description
      });
    }
  }
}

function verifyFileReady(filePath, description) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`${description}: File not found at ${filePath}`);
  }
  
  const stats = fs.statSync(filePath);
  if (!stats.size) {
    throw new Error(`${description}: File is empty at ${filePath}`);
  }
  
  return stats;
}

function getAudioDuration(filePath) {
  try {
    const probe = spawnSync('ffprobe', [
      '-v', 'error',
      '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1',
      filePath
    ], { encoding: 'utf8' });
    
    if (probe.status === 0) {
      const duration = parseFloat(probe.stdout.trim());
      return isNaN(duration) ? null : duration;
    }
    return null;
  } catch (error) {
    log.warn("⚠️ Could not determine audio duration", {
      filePath,
      error: error.message
    });
    return null;
  }
}

export async function editingProcessor(sessionId, inputPathObj) {
  const keepAliveId = `editingProcessor:${sessionId}`;
  startKeepAlive(keepAliveId, 25000);
  ensureTmpDir();

  const inputPath =
    typeof inputPathObj === "string" ? inputPathObj : inputPathObj?.localPath;

  if (!inputPath || typeof inputPath !== "string") {
    stopKeepAlive(keepAliveId);
    throw new Error(
      `Invalid inputPath passed to editingProcessor. Received: ${JSON.stringify(
        inputPathObj
      )}`
    );
  }

  if (!fs.existsSync(inputPath)) {
    stopKeepAlive(keepAliveId);
    throw new Error(`Input file does not exist: ${inputPath}`);
  }

  const stats = verifyFileReady(inputPath, "Input file");
  log.info("🎚️ Starting editingProcessor workflow", {
    sessionId,
    inputPath,
    size: stats.size,
  });

  const stage1Path = path.join(TMP_DIR, `${sessionId}_stage1_pitch.mp3`);
  const stage2APath = path.join(TMP_DIR, `${sessionId}_stage2A_eq_lowmid.mp3`);
  const stage2BPath = path.join(TMP_DIR, `${sessionId}_stage2B_eq_high.mp3`);
  const stage3Path = path.join(TMP_DIR, `${sessionId}_stage3_deess.mp3`);
  const stage4APath = path.join(TMP_DIR, `${sessionId}_stage4A_comp.mp3`);
  const stage4BPath = path.join(TMP_DIR, `${sessionId}_stage4B_limit.mp3`);
  const stage5Path = path.join(TMP_DIR, `${sessionId}_stage5_stereo.mp3`);
  const stage6Path = path.join(TMP_DIR, `${sessionId}_stage6_fades.mp3`);
  const finalPath = path.join(TMP_DIR, `${sessionId}_edited.mp3`);

  // Clean up any existing files from previous runs
  const stagePaths = [
    stage1Path,
    stage2APath,
    stage2BPath,
    stage3Path,
    stage4APath,
    stage4BPath,
    stage5Path,
    stage6Path,
    finalPath,
  ];

  for (const stagePath of stagePaths) {
    safeFileCleanup(sessionId, stagePath, "pre-run cleanup");
  }

  let currentInput = inputPath;
  let previousStagePath = null; // Track the stage before current for cleanup

  try {
    // Stage 1: Pitch Shift
    currentInput = await runFFmpegStage(
      sessionId,
      currentInput,
      stage1Path,
      "rubberband=pitch=0.93:tempo=1.0",
      "Stage 1: 🗣️ Pitch Shift"
    );
    verifyFileReady(stage1Path, "Stage 1 output");
    // Clean up original input file (now we have stage1)
    safeFileCleanup(sessionId, inputPath, "original input after stage 1");
    previousStagePath = stage1Path;

    // Stage 2A: EQ Low-End + Low-Mids
    const eqStage2A = [
      "equalizer=f=100:t=q:w=1.1:g=3.5",
    ].join(",");

    currentInput = await runFFmpegStage(
      sessionId,
      currentInput,
      stage2APath,
      eqStage2A,
      "Stage 2A: 🎛️ EQ Low-End + Low-Mids"
    );
    verifyFileReady(stage2APath, "Stage 2A output");
    // Clean up previous stage (stage1)
    safeFileCleanup(sessionId, previousStagePath, "stage 1 after stage 2A");
    previousStagePath = stage2APath;

    // Stage 2B: EQ High-End + Presence
    const eqStage2B = [
      "equalizer=f=2200:t=q:w=1.5:g=1.5",
      "equalizer=f=4500:t=q:w=2.0:g=-2.8",
      "equalizer=f=8500:t=h:g=-2",
    ].join(",");

    currentInput = await runFFmpegStage(
      sessionId,
      currentInput,
      stage2BPath,
      eqStage2B,
      "Stage 2B: 🎛️ EQ High-End + Presence"
    );
    verifyFileReady(stage2BPath, "Stage 2B output");
    // Clean up previous stage (stage2A)
    safeFileCleanup(sessionId, previousStagePath, "stage 2A after stage 2B");
    previousStagePath = stage2BPath;

    // Stage 3: De-Esser
    currentInput = await runFFmpegStage(
      sessionId,
      currentInput,
      stage3Path,
      "deesser=i=0.4:m=0.75:f=0.5",
      "Stage 3: 🎛️ De-Esser"
    );
    verifyFileReady(stage3Path, "Stage 3 output");
    // Clean up previous stage (stage2B)
    safeFileCleanup(sessionId, previousStagePath, "stage 2B after stage 3");
    previousStagePath = stage3Path;

    // Stage 4A: Compressor
    const compFilter =
      "acompressor=threshold=-20dB:ratio=4:attack=15:release=250:makeup=3";

    currentInput = await runFFmpegStage(
      sessionId,
      currentInput,
      stage4APath,
      compFilter,
      "Stage 4A: 🎛️ Compressor"
    );
    verifyFileReady(stage4APath, "Stage 4A output");
    // Clean up previous stage (stage3)
    safeFileCleanup(sessionId, previousStagePath, "stage 3 after stage 4A");
    previousStagePath = stage4APath;

    // Stage 4B: Limiter
    const limitFilter = "alimiter=limit=0.95:attack=5:release=100";

    currentInput = await runFFmpegStage(
      sessionId,
      currentInput,
      stage4BPath,
      limitFilter,
      "Stage 4B: 🎛️ Limiter"
    );
    verifyFileReady(stage4BPath, "Stage 4B output");
    // Clean up previous stage (stage4A)
    safeFileCleanup(sessionId, previousStagePath, "stage 4A after stage 4B");
    previousStagePath = stage4BPath;

    // Stage 5: Mono → Stereo
    currentInput = await runFFmpegStage(
      sessionId,
      currentInput,
      stage5Path,
      "pan=stereo|c0=c0|c1=c0",
      "Stage 5: 🔊 Mono → Stereo Conversion"
    );
    verifyFileReady(stage5Path, "Stage 5 output");
    // Clean up previous stage (stage4B)
    safeFileCleanup(sessionId, previousStagePath, "stage 4B after stage 5");
    previousStagePath = stage5Path;

    // Stage 6: Fade In/Out - CORRECTED VERSION
    log.info("🔍 DEBUG: Before Stage 6", {
      sessionId,
      currentInput,
      exists: fs.existsSync(currentInput),
      size: fs.existsSync(currentInput) ? fs.statSync(currentInput).size : 0,
      previousStagePath,
      previousExists: fs.existsSync(previousStagePath),
      previousSize: fs.existsSync(previousStagePath) ? fs.statSync(previousStagePath).size : 0
    });

    try {
      // Get audio duration to calculate proper fade out position
      const audioDuration = getAudioDuration(currentInput);
      
      let fadeFilter;
      if (audioDuration && audioDuration > VOICE_FADE_SECONDS * 2) {
        // Calculate fade out start time (duration - fade length)
        const fadeOutStart = Math.max(0, audioDuration - VOICE_FADE_SECONDS);
        
        // CORRECTED: Fade in at start, fade out at end
        fadeFilter = `afade=t=in:st=0:d=${VOICE_FADE_SECONDS},afade=t=out:st=${fadeOutStart}:d=${VOICE_FADE_SECONDS}`;
        
        log.info("🎚️ Starting Stage 6 with duration-based fade in/out", {
          sessionId,
          fadeFilter,
          audioDuration,
          fadeIn: `0-${VOICE_FADE_SECONDS}s`,
          fadeOut: `${fadeOutStart}-${audioDuration}s`
        });
      } else {
        // Fallback: Let FFmpeg automatically handle fade out at the end
        fadeFilter = `afade=t=in:d=${VOICE_FADE_SECONDS},afade=t=out:d=${VOICE_FADE_SECONDS}`;
        
        log.info("🎚️ Starting Stage 6 with automatic fade in/out", {
          sessionId,
          fadeFilter,
          audioDuration: audioDuration || 'unknown',
          reason: audioDuration ? 'audio too short for precise fades' : 'could not detect duration'
        });
      }

      currentInput = await runFFmpegStage(
        sessionId,
        currentInput,
        stage6Path,
        fadeFilter,
        "Stage 6: 🎚️ Corrected Fade In/Out (3s)"
      );
      
      verifyFileReady(stage6Path, "Stage 6 output");
      
      // Copy to final BEFORE cleaning up stage5
      fs.copyFileSync(stage6Path, finalPath);
      verifyFileReady(finalPath, "Final file after copy");
      
      // Now clean up stage5 (previous stage)
      safeFileCleanup(sessionId, previousStagePath, "stage 5 after final copy");
      previousStagePath = stage6Path;

    } catch (stage6Err) {
      log.error("💥 Stage 6 fade failed, skipping fade and using stage5", {
        sessionId,
        error: stage6Err.message,
        previousStagePath
      });
      
      // Skip the fade stage and use stage5 directly
      fs.copyFileSync(previousStagePath, finalPath);
      verifyFileReady(finalPath, "Final file after skipping fade");
      currentInput = finalPath;
    }

    // Upload final file
    const finalStats = verifyFileReady(finalPath, "Final file before upload");
    const buffer = fs.readFileSync(finalPath);
    const key = `${sessionId}_edited.mp3`;

    await uploadBuffer("editedAudio", key, buffer, "audio/mpeg");

    log.info("💾 Uploaded edited MP3 to R2 (editedAudio)", {
      sessionId,
      key,
      size: buffer.length,
      finalPath,
      fadeApplied: currentInput === stage6Path
    });

    stopKeepAlive(keepAliveId);
    return finalPath;

  } catch (err) {
    log.error("💥 editingProcessor stage failed", {
      sessionId,
      error: err.message,
      currentStage: currentInput,
      previousStage: previousStagePath || "none",
    });

    // Fallback logic - use the last successful stage
    try {
      const fallbackPath = previousStagePath || inputPath;
      if (fs.existsSync(fallbackPath)) {
        const fallbackBuffer = fs.readFileSync(fallbackPath);
        const key = `${sessionId}_edited.mp3`;

        await uploadBuffer("editedAudio", key, fallbackBuffer, "audio/mpeg");

        if (fallbackPath !== finalPath) {
          fs.copyFileSync(fallbackPath, finalPath);
        }

        log.warn("⚠️ Used fallback audio for edited upload", {
          sessionId,
          fallbackPath,
          fallbackSize: fallbackBuffer.length,
        });

        stopKeepAlive(keepAliveId);
        return finalPath;
      } else {
        throw new Error(`No fallback file available at ${fallbackPath}`);
      }
    } catch (fallbackErr) {
      log.error("💥 editingProcessor fallback also failed", {
        sessionId,
        error: fallbackErr.message,
        fallbackPath: previousStagePath || "none",
      });
      stopKeepAlive(keepAliveId);
      throw fallbackErr;
    }
  } finally {
    // Final cleanup - remove all intermediate files except final
    for (const stagePath of [stage1Path, stage2APath, stage2BPath, stage3Path, 
                            stage4APath, stage4BPath, stage5Path, stage6Path]) {
      if (stagePath !== finalPath) {
        safeFileCleanup(sessionId, stagePath, "final cleanup");
      }
    }
    stopKeepAlive(keepAliveId);
  }
}

export default editingProcessor;
