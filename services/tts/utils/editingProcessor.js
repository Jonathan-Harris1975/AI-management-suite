// ============================================================
// 🎙️ STREAMING Editing Processor — Mature Deep Voice Edition
// Natural • Authoritative • Broadcast Quality
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
// ⭐ MATURE DEEPER VOICE FILTER CHAIN (Corrected)
// ------------------------------------------------------------
//
// ORDER MATTERS - Optimized for natural, deeper voice
//
// 1) Proper pitch lowering for mature voice
// 2) Warmth and body enhancement
// 3) Clarity without harshness
// 4 Gentle de-essing
// 5) Natural dynamics
// 6) Clean output
//
const filters = [
  // 1️⃣ CORRECT PITCH LOWERING - Key fix for mature voice
  // Lower pitch by ~8% for natural deeper tone
  "asetrate=44100*0.92,aresample=44100",
  
  // 2️⃣ WARMTH & BODY - Add richness to lower frequencies
  "equalizer=f=80:width_type=h:width=100:g=4",
  "equalizer=f=180:width_type=h:width=120:g=3",
  "equalizer=f=320:width_type=h:width=150:g=2",
  
  // 3️⃣ CLARITY & PRESENCE - Natural intelligibility
  "equalizer=f=1200:width_type=h:width=400:g=2",
  "equalizer=f=2400:width_type=h:width=600:g=1.5",
  
  // 4️⃣ REDUCE HARSHNESS - Smooth out high frequencies
  "equalizer=f=4000:width_type=h:width=1000:g=-2",
  "equalizer=f=8000:width_type=h:width=2000:g=-3",
  
  // 5️⃣ GENTLE DE-ESSING - Less aggressive than before
  "deesser=i=0.25:mode=i",
  
  // 6️⃣ NATURAL COMPRESSION - Smooth dynamics
  "acompressor=threshold=-20dB:ratio=2.5:attack=30:release=300:makeup=1.5",
  
  // 7️⃣ CLEAN LIMITING - Prevent clipping
  "alimiter=limit=-1dB:attack=10:release=100"
];

// ------------------------------------------------------------
// 🧩 Streaming Editing Processor
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

  log.info("🎚️ Starting mature voice editingProcessor", { sessionId, inputPath });

  const editedPath = path.join(TMP_DIR, `${sessionId}_edited.mp3`);
  const filterStr = filters.join(",");
  let ffmpegSucceeded = false;

  if (fs.existsSync(editedPath)) {
    try {
      fs.unlinkSync(editedPath);
    } catch (cleanupErr) {
      log.warn("⚠️ Could not clean up existing edited file", { sessionId, error: cleanupErr.message });
    }
  }

  try {
    const ffmpeg = spawn("ffmpeg", [
      "-hide_banner",
      "-loglevel",
      "error",
      "-i",
      "pipe:0",
      "-af",
      filterStr,

      // Output settings
      "-ar", "44100",
      "-codec:a", "libmp3lame",
      "-b:a", "192k",
      "-ac", "1", // Mono for consistent voice processing
      "-y",
      editedPath,
    ]);

    let ffmpegErr = "";
    let settled = false;

    const fail = (err) => {
      if (settled) return;
      settled = true;

      log.error("💥 editingProcessor ffmpeg failure", { sessionId, error: err.message, ffmpegErr });
    };

    ffmpeg.stderr.on("data", (d) => (ffmpegErr += d.toString()));
    ffmpeg.on("error", (err) => fail(err));

    ffmpeg.stdin.on("error", (err) => {
      if (err.code !== "EPIPE") {
        log.error("💥 ffmpeg stdin error", { sessionId, err });
      }
      fail(err);
    });

    await new Promise((resolve, reject) => {
      const inputStream = fs.createReadStream(inputPath, {
        highWaterMark: 64 * 1024,
      });

      const safeReject = (err) => {
        if (settled) return;
        settled = true;
        try {
          ffmpeg.stdin.end();
        } catch {}
        try {
          inputStream.destroy();
        } catch {}

        reject(err);
      };

      inputStream.on("error", (err) => {
        log.error("💥 inputStream error", { sessionId, err });
        safeReject(err);
      });

      inputStream.on("data", (chunk) => {
        if (settled) return;
        const ok = ffmpeg.stdin.write(chunk);
        if (!ok) {
          inputStream.pause();
          ffmpeg.stdin.once("drain", () => {
            if (!settled) inputStream.resume();
          });
        }
      });

      inputStream.on("end", () => {
        if (!settled) ffmpeg.stdin.end();
      });

      ffmpeg.on("close", (code) => {
        if (settled) return;

        if (code !== 0) {
          safeReject(new Error(`ffmpeg exited with ${code} — ${ffmpegErr}`));
        } else {
          settled = true;
          ffmpegSucceeded = true;
          resolve();
        }
      });
    });

    // Validate output
    if (!fs.existsSync(editedPath)) {
      throw new Error("Edited file was not created");
    }

    const editedStats = fs.statSync(editedPath);
    if (!editedStats.size) {
      throw new Error("Edited file is empty");
    }

    // Upload
    const buffer = fs.readFileSync(editedPath);
    const key = `${sessionId}_edited.mp3`;

    await uploadBuffer("merged", key, buffer, "audio/mpeg");

    log.info("💾 Uploaded mature voice MP3 to R2", { sessionId, key, size: buffer.length });

    stopKeepAlive();
    return editedPath;
  } catch (err) {
    // Fallback
    log.error("💥 editingProcessor failed — fallback to unedited audio", { sessionId, error: err.message });

    try {
      if (!ffmpegSucceeded) {
        if (!fs.existsSync(editedPath)) {
          fs.copyFileSync(inputPath, editedPath);
          log.info("🔄 Created fallback copy of original audio", { sessionId });
        }

        const buffer = fs.readFileSync(editedPath);
        const key = `${sessionId}_edited.mp3`;

        await uploadBuffer("merged", key, buffer, "audio/mpeg");

        log.info("💾 Uploaded fallback (unedited) MP3 to R2", { sessionId, key, fallback: true });
      }
    } catch (fallbackErr) {
      log.error("💥 editingProcessor fallback also failed", { sessionId, error: fallbackErr.message });
      stopKeepAlive();
      throw fallbackErr;
    }

    stopKeepAlive();
    return editedPath;
  }
}

export default editingProcessor;
