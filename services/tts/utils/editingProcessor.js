// ============================================================
// 🎙️ STREAMING Editing Processor — Premium Radio Host Version
// FIXED: Natural, Warm, Professional Broadcast Voice
// ============================================================

import fs from "fs";
import path from "path";
import { spawn } from "child_process";
import { log } from "#logger.js";
import { startKeepAlive, stopKeepAlive } from "#shared/keepalive.js";
import { uploadBuffer } from "#shared/r2-client.js";

const TMP_DIR = "/tmp/tts_editing";

function ensureTmpDir() {
  if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR, { recursive: true });
}

// ------------------------------------------------------------
// ⭐ CORRECTED PREMIUM RADIO HOST FILTER CHAIN
// Natural Human Voice + Broadcast Polish
// ------------------------------------------------------------
const filters = [
  // 1️⃣ Subtle pitch deepening (more mature, less synthetic)
  // FIXED: Use 1.018 to LOWER pitch (was 0.982 which raised it!)
  "asetrate=44100*1.018,aresample=44100,atempo=0.982",

  // 2️⃣ Warmth EQ: Roll off harsh highs, add body
  "equalizer=f=120:t=q:w=1.2:g=3",      // Add chest resonance
  "equalizer=f=250:t=q:w=1.0:g=2",      // Warmth/body
  "equalizer=f=3500:t=q:w=2.0:g=-2",    // Reduce harshness
  "equalizer=f=8000:t=h:g=-3",          // Gentle high rolloff

  // 3️⃣ Broadcast presence (much gentler than before)
  "equalizer=f=2800:t=q:w=1.5:g=1.5",   // Clarity (not harshness)

  // 4️⃣ De-esser to tame sibilance
  "deesser=i=0.3:m=0.4:f=6000:s=o",

  // 5️⃣ Gentle broadcast compression (slower attack = more natural)
  "acompressor=threshold=-20dB:ratio=3:attack=20:release=250:makeup=3:knee=3",

  // 6️⃣ Gentle limiting for safety
  "alimiter=level_in=1:level_out=0.95:limit=0.95:attack=7:release=100",

  
];

// ------------------------------------------------------------
// 🧩 Bomb-proof Streaming Editor (with full fallback)
// ------------------------------------------------------------
export async function editingProcessor(sessionId, inputPathObj) {
  startKeepAlive(`editingProcessor:${sessionId}`, 25000);
  ensureTmpDir();

  const inputPath =
    typeof inputPathObj === "string" ? inputPathObj : inputPathObj?.localPath;

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
    "🎚️ Starting streaming editingProcessor (Premium Radio Host - CORRECTED)"
  );

  const editedPath = path.join(TMP_DIR, `${sessionId}_edited.mp3`);
  const filterStr = filters.join(",");
  let ffmpegSucceeded = false;

  try {
    const ffmpeg = spawn("ffmpeg", [
      "-hide_banner",
      "-loglevel",
      "error",
      "-i",
      "pipe:0",
      "-af",
      filterStr,
      "-ar",
      "44100",
      "-b:a",
      "192k",
      "-codec:a",
      "libmp3lame",
      "-q:a",
      "2",  // High quality VBR
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
      if (err.code === "EPIPE") {
        log.warn({ sessionId }, "⚠️ ffmpeg stdin EPIPE (ffmpeg closed early)");
      } else {
        log.error({ sessionId, err }, "💥 ffmpeg stdin error");
      }
      fail(err);
    });

    await new Promise((resolve, reject) => {
      const inputStream = fs.createReadStream(inputPath, {
        highWaterMark: 64 * 1024  // 64KB chunks for smooth streaming
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
        if (settled) return;
        ffmpeg.stdin.end();
      });

      ffmpeg.on("close", (code) => {
        if (settled) return;

        if (code !== 0) {
          safeReject(
            new Error(
              `ffmpeg exited with code ${code} — ${
                ffmpegErr || "no stderr"
              }`
            )
          );
        } else {
          settled = true;
          ffmpegSucceeded = true;
          resolve();
        }
      });
    });

    // Upload edited version
    const buffer = fs.readFileSync(editedPath);
    const key = `${sessionId}_edited.mp3`;

    await uploadBuffer("merged", key, buffer, "audio/mpeg");

    log.info(
      { sessionId, key, size: buffer.length },
      "💾 Uploaded edited MP3 to R2 (Natural Professional Voice)"
    );

    stopKeepAlive();
    return editedPath;
  } catch (err) {
    // HARD FALLBACK → Never break the pipeline
    log.error(
      { sessionId, error: err.message },
      "💥 editingProcessor failed — fallback to unedited audio"
    );

    try {
      if (!ffmpegSucceeded) {
        if (!fs.existsSync(editedPath)) {
          fs.copyFileSync(inputPath, editedPath);
        }

        const buffer = fs.readFileSync(editedPath);
        const key = `${sessionId}_edited.mp3`;
        await uploadBuffer("merged", key, buffer, "audio/mpeg");

        log.info(
          { sessionId, key },
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
