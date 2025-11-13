// ============================================================
// 🎚️ STREAMING Editing Processor — Bomb-Proof Version
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
// 🎛️ Audio Enhancement Filters (Warm + Clean + Controlled)
// ------------------------------------------------------------
const filters = [
  "highpass=f=100,lowpass=f=10000,afftdn=nr=10:tn=1,firequalizer=gain_entry='entry(150,3);entry(2500,2)',deesser=f=7000:i=0.7,acompressor=threshold=-24dB:ratio=4:attack=10:release=200:makeup=5,dynaudnorm=f=100:n=0:p=0.9,aresample=44100,aconvolution=reverb=0.1:0.1:0.9:0.9",
  "equalizer=f=120:width_type=o:width=2:g=3",
  "equalizer=f=9000:width_type=o:width=2:g=2",
];

// ------------------------------------------------------------
// 🧩 Streaming Editing Processor
// ------------------------------------------------------------
export async function editingProcessor(sessionId, inputPathObj) {
  startKeepAlive(`editingProcessor:${sessionId}`, 25000);
  ensureTmpDir();

  // Support both string path and { localPath, key } object
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

  // Basic sanity checks
  if (!fs.existsSync(inputPath)) {
    stopKeepAlive();
    throw new Error(`Input file does not exist: ${inputPath}`);
  }

  const stats = fs.statSync(inputPath);
  if (!stats.size) {
    stopKeepAlive();
    throw new Error(`Input file is empty: ${inputPath}`);
  }

  log.info({ sessionId, inputPath }, "🎚️ Starting streaming editingProcessor");

  const editedPath = path.join(TMP_DIR, `${sessionId}_edited.mp3`);
  const filterStr = filters.join(",");

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

    ffmpeg.stderr.on("data", (d) => {
      ffmpegErr += d.toString();
    });

    ffmpeg.on("error", (err) => {
      fail(err);
    });

    // 🔑 Handle EPIPE and other stdin errors so Node doesn't crash
    ffmpeg.stdin.on("error", (err) => {
      if (err.code === "EPIPE") {
        log.warn({ sessionId }, "⚠️ ffmpeg stdin EPIPE (ffmpeg closed early)");
      } else {
        log.error({ sessionId, err }, "💥 ffmpeg stdin error");
      }
      fail(err);
    });

    await new Promise((resolve, reject) => {
      const inputStream = fs.createReadStream(inputPath);

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
        if (settled) return; // ffmpeg already died, stop pushing

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
              `ffmpeg exited with code ${code} — ${ffmpegErr || "no stderr"}`
            )
          );
        } else {
          settled = true;
          resolve();
        }
      });
    });

    // Upload edited file
    const buffer = fs.readFileSync(editedPath);
    const key = `${sessionId}_edited.mp3`;

    await uploadBuffer("merged", key, buffer, "audio/mpeg");

    log.info({ sessionId, key }, "💾 Uploaded edited MP3 to R2");

    stopKeepAlive();
    return editedPath;
  } catch (err) {
    log.error({ sessionId, error: err.message }, "💥 editingProcessor failed");
    stopKeepAlive();
    throw err;
  }
}

export default editingProcessor;
