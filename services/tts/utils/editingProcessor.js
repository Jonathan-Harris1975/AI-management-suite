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
//   6: Subtle Fade In/Out (0.3s)
//   7: Final copy + upload to R2 ("editedAudio")
// ============================================================

import fs from "fs";
import path from "path";
import { spawn } from "child_process";
import { log } from "#logger.js";
import { startKeepAlive, stopKeepAlive } from "#shared/keepalive.js";
import { uploadBuffer } from "#shared/r2-client.js";

const TMP_DIR = "/tmp/tts_editing";
const VOICE_FADE_SECONDS = 0.3; // Profile A: subtle fade in/out

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

  const stats = fs.statSync(inputPath);
  if (!stats.size) {
    stopKeepAlive(keepAliveId);
    throw new Error(`Input file is empty: ${inputPath}`);
  }

  log.info("🎚️ Starting  editingProcessor work flow ", {
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
    if (fs.existsSync(stagePath)) {
      try {
        fs.unlinkSync(stagePath);
        log.info("🧹 Cleaned up existing stage file before run", {
          sessionId,
          path: stagePath,
        });
      } catch (cleanupErr) {
        log.warn("⚠️ Could not clean up existing stage file", {
          sessionId,
          path: stagePath,
          error: cleanupErr.message,
        });
      }
    }
  }

  let currentInput = inputPath;
  let lastSuccessfulStage = null;

  try {
    currentInput = await runFFmpegStage(
      sessionId,
      currentInput,
      stage1Path,
      "rubberband=pitch=0.92:tempo=1.0",
      "Stage 1: 🗣️ Pitch Shift"
    );
    lastSuccessfulStage = stage1Path;

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

    if (lastSuccessfulStage && fs.existsSync(lastSuccessfulStage)) {
      fs.unlinkSync(lastSuccessfulStage);
    }
    lastSuccessfulStage = stage2APath;

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

    if (lastSuccessfulStage && fs.existsSync(lastSuccessfulStage)) {
      fs.unlinkSync(lastSuccessfulStage);
    }
    lastSuccessfulStage = stage2BPath;

    currentInput = await runFFmpegStage(
      sessionId,
      currentInput,
      stage3Path,
      "deesser=i=0.4:m=0.75:f=0.5",
      "Stage 3: 🎛️ De-Esser"
    );

    if (lastSuccessfulStage && fs.existsSync(lastSuccessfulStage)) {
      fs.unlinkSync(lastSuccessfulStage);
    }
    lastSuccessfulStage = stage3Path;

    const compFilter =
      "acompressor=threshold=-20dB:ratio=4:attack=15:release=250:makeup=3";

    currentInput = await runFFmpegStage(
      sessionId,
      currentInput,
      stage4APath,
      compFilter,
      "Stage 4A: 🎛️ Compressor"
    );

    if (lastSuccessfulStage && fs.existsSync(lastSuccessfulStage)) {
      fs.unlinkSync(lastSuccessfulStage);
    }
    lastSuccessfulStage = stage4APath;

    const limitFilter = "alimiter=limit=0.95:attack=5:release=100";

    currentInput = await runFFmpegStage(
      sessionId,
      currentInput,
      stage4BPath,
      limitFilter,
      "Stage 4B: 🎛️ Limiter"
    );

    if (lastSuccessfulStage && fs.existsSync(lastSuccessfulStage)) {
      fs.unlinkSync(lastSuccessfulStage);
    }
    lastSuccessfulStage = stage4BPath;

    currentInput = await runFFmpegStage(
      sessionId,
      currentInput,
      stage5Path,
      "pan=stereo|c0=c0|c1=c0",
      "Stage 5: 🔊 Mono → Stereo Conversion"
    );

    if (lastSuccessfulStage && fs.existsSync(lastSuccessfulStage)) {
      fs.unlinkSync(lastSuccessfulStage);
    }
    lastSuccessfulStage = stage5Path;

    const fadeFilter = `afade=t=in:d=${VOICE_FADE_SECONDS},areverse,afade=t=in:d=${VOICE_FADE_SECONDS},areverse`;

    currentInput = await runFFmpegStage(
      sessionId,
      currentInput,
      stage6Path,
      fadeFilter,
      "Stage 6: 🎚️ Subtle Fade In/Out"
    );

    if (lastSuccessfulStage && fs.existsSync(lastSuccessfulStage)) {
      fs.unlinkSync(lastSuccessfulStage);
    }
    lastSuccessfulStage = stage6Path;

    fs.copyFileSync(stage6Path, finalPath);

    const buffer = fs.readFileSync(finalPath);
    const key = `${sessionId}_edited.mp3`;

    await uploadBuffer("editedAudio", key, buffer, "audio/mpeg");

    log.info("💾 Uploaded edited MP3 to R2 (editedAudio)", {
      sessionId,
      key,
      size: buffer.length,
    });

    stopKeepAlive(keepAliveId);
    return finalPath;
  } catch (err) {
    log.error("💥 editingProcessor stage failed", {
      sessionId,
      error: err.message,
      lastSuccessfulStage: lastSuccessfulStage || "none",
    });

    try {
      const fallbackPath = lastSuccessfulStage || inputPath;
      const fallbackBuffer = fs.readFileSync(fallbackPath);
      const key = `${sessionId}_edited.mp3`;

      await uploadBuffer("editedAudio", key, fallbackBuffer, "audio/mpeg");

      if (fallbackPath !== finalPath) {
        fs.copyFileSync(fallbackPath, finalPath);
      }

      log.warn("⚠️ Used fallback audio for edited upload", {
        sessionId,
        fallbackPath,
      });

      stopKeepAlive(keepAliveId);
      return finalPath;
    } catch (fallbackErr) {
      log.error("💥 editingProcessor fallback also failed", {
        sessionId,
        error: fallbackErr.message,
      });
      stopKeepAlive(keepAliveId);
      throw fallbackErr;
    }
  } finally {
    for (const stagePath of stagePaths) {
      if (stagePath !== finalPath && fs.existsSync(stagePath)) {
        try {
          fs.unlinkSync(stagePath);
          log.info("🧹 Final cleanup of stage file", {
            sessionId,
            path: stagePath,
          });
        } catch (cleanupErr) {
          log.warn("⚠️ Could not clean up stage file in finally", {
            sessionId,
            path: stagePath,
            error: cleanupErr.message,
          });
        }
      }
    }
  }
}

export default editingProcessor;
