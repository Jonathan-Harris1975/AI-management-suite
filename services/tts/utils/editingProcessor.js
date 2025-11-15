// 🎙️ STREAMING Editing Processor — Podcast-Ready Version
// Normal Speed • Deeper Tone • Broadcast-Ready
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
// ⭐ PODCAST-READY FILTER CHAIN (Normal Speed, Deeper Tone - FIXED)
// ------------------------------------------------------------
const filters = [
  // 1️⃣ CORRECTED: Normal speed with deeper pitch (0.85-0.9 for natural deeper tone)
  "rubberband=pitch=0.89:tempo=1.0",

  // 2️⃣ Enhanced low-end warmth for depth
  "equalizer=f=80:t=q:w=1.2:g=4",
  "equalizer=f=150:t=q:w=1.1:g=3.5",
  "equalizer=f=250:t=q:w=1.0:g=2.5",

  // 3️⃣ Reduce mid-high harshness
  "equalizer=f=3000:t=q:w=2.0:g=-2.5",
  "equalizer=f=6000:t=q:w=2.0:g=-3",
  "equalizer=f=8500:t=h:g=-2",

  // 4️⃣ Slight presence boost for clarity
  "equalizer=f=2200:t=q:w=1.5:g=1.5",

  // 5️⃣ Professional de-esser
  "deesser=i=0.4:m=0.75:f=0.5",

  // 6️⃣ Podcast-grade compression
  "acompressor=threshold=-20dB:ratio=4:attack=15:release=250:makeup=3",

  // 7️⃣ Broadcast limiter for consistent loudness
  "alimiter=limit=0.95:attack=5:release=100"
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

  log.info("🎚️ Starting streaming editingProcessor (Podcast-Ready: Normal Speed, Deeper Tone)", { sessionId, inputPath });

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

      // Output
      "-ar", "44100",
      "-codec:a", "libmp3lame",
      "-b:a", "192k",
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

    log.info("💾 Uploaded edited MP3 to R2 (Podcast-Ready)", { sessionId, key, size: buffer.length });

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
