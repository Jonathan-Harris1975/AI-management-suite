// ============================================================
// 🎙️ STREAMING Editing Processor — Premium Radio Host Version
// Mature UK Tone • Warm • Natural • Broadcast-Ready
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
// ⭐ FINAL UK-PREMIUM RADIO HOST FILTER CHAIN (Stable)
// ------------------------------------------------------------
//
// ORDER MATTERS (this sequence avoids SIGSEGV + tonal artifacts)
//
// 1) Correct low-pitch adjustment
// 2) Warm EQ
// 3) Presence (light)
// 4) De-esser (stable version)
// 5) Compression
// 6) Output limiting
//
const filters = [
  // 1️⃣ Pitch LOWERING — UK mature tone fix
  // Correct: raise sample rate → lower pitch
  "asetrate=44100*1.018,aresample=44100,atempo=0.982",

  // 2️⃣ Warm body
  "equalizer=f=120:t=q:w=1.1:g=3",
  "equalizer=f=250:t=q:w=1.0:g=2",
  "equalizer=f=3500:t=q:w=2.0:g=-2",
  "equalizer=f=7800:t=h:g=-2.5",

  // 3️⃣ Slight presence (British radio clarity)
  "equalizer=f=2600:t=q:w=1.5:g=1.2",

  // 4️⃣ Stable de-esser (no crashing)
  "deesser=i=6:m=3:f=5500",

  // 5️⃣ Natural compression
  "acompressor=threshold=-18dB:ratio=3.5:attack=18:release=260:makeup=2",

  // 6️⃣ Broadcast limiter
  "alimiter=limit=0.92:attack=6:release=90"
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

  log.info(
    { sessionId, inputPath },
    "🎚️ Starting streaming editingProcessor (UK Premium Radio Host)"
  );

  const editedPath = path.join(TMP_DIR, `${sessionId}_edited.mp3`);
  const filterStr = filters.join(",");
  let ffmpegSucceeded = false;

  if (fs.existsSync(editedPath)) {
    try {
      fs.unlinkSync(editedPath);
    } catch (cleanupErr) {
      log.warn(
        { sessionId, error: cleanupErr.message },
        "⚠️ Could not clean up existing edited file"
      );
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

      log.error(
        { sessionId, error: err.message, ffmpegErr },
        "💥 editingProcessor ffmpeg failure"
      );
    };

    ffmpeg.stderr.on("data", (d) => (ffmpegErr += d.toString()));
    ffmpeg.on("error", (err) => fail(err));

    ffmpeg.stdin.on("error", (err) => {
      if (err.code !== "EPIPE") {
        log.error({ sessionId, err }, "💥 ffmpeg stdin error");
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
        log.error({ sessionId, err }, "💥 inputStream error");
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

    log.info(
      { sessionId, key, size: buffer.length },
      "💾 Uploaded edited MP3 to R2 (UK Premium Host)"
    );

    stopKeepAlive();
    return editedPath;
  } catch (err) {
    // Fallback
    log.error(
      { sessionId, error: err.message },
      "💥 editingProcessor failed — fallback to unedited audio"
    );

    try {
      if (!ffmpegSucceeded) {
        if (!fs.existsSync(editedPath)) {
          fs.copyFileSync(inputPath, editedPath);
          log.info({ sessionId }, "🔄 Created fallback copy of original audio");
        }

        const buffer = fs.readFileSync(editedPath);
        const key = `${sessionId}_edited.mp3`;

        await uploadBuffer("merged", key, buffer, "audio/mpeg");

        log.info(
          { sessionId, key, fallback: true },
          "💾 Uploaded fallback (unedited) MP3 to R2"
        );
      }
    } catch (fallbackErr) {
      log.error(
        { sessionId, error: fallbackErr.message },
        "💥 editingProcessor fallback also failed"
      );
      stopKeepAlive();
      throw fallbackErr;
    }

    stopKeepAlive();
    return editedPath;
  }
}

export default editingProcessor;
