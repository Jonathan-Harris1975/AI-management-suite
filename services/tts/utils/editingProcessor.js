// ============================================================
// 🎚️ STREAMING Editing Processor — Zero OOM Version (Final)
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

  // --------------------------------------------------------
  // 🔧 FIX: extract correct input path from object or string
  // --------------------------------------------------------
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

  log.info({ sessionId, inputPath }, "🎚️ Starting streaming editingProcessor");

  const editedPath = path.join(TMP_DIR, `${sessionId}_edited.mp3`);
  const filterStr = filters.join(",");

  try {
    // 🔥 Spawn ffmpeg
    const ffmpeg = spawn("ffmpeg", [
      "-hide_banner",
      "-loglevel",
      "error",

      // STREAM INPUT
      "-i",
      "pipe:0",

      // FILTER CHAIN
      "-af",
      filterStr,

      // Output settings
      "-ar",
      "44100",
      "-b:a",
      "192k",

      // Save output
      "-y",
      editedPath,
    ]);

    let ffmpegErr = "";

    ffmpeg.stderr.on("data", (d) => {
      ffmpegErr += d.toString();
    });

    ffmpeg.on("error", (err) => {
      log.error({ sessionId, err }, "💥 ffmpeg editing spawn error");
    });

    // --------------------------------------------------------
    // 📥 STREAM INPUT FILE → FFMPEG STDIN
    // --------------------------------------------------------
    await new Promise((resolve, reject) => {
      const inputStream = fs.createReadStream(inputPath);

      inputStream.on("error", reject);

      inputStream.on("data", (chunk) => {
        const ok = ffmpeg.stdin.write(chunk);
        if (!ok) {
          inputStream.pause();
          ffmpeg.stdin.once("drain", () => inputStream.resume());
        }
      });

      inputStream.on("end", () => ffmpeg.stdin.end());

      ffmpeg.on("close", (code) => {
        if (code !== 0) {
          reject(
            new Error(`ffmpeg exited with code ${code} — ${ffmpegErr || "no stderr"}`)
          );
        } else {
          resolve();
        }
      });
    });

    // --------------------------------------------------------
    // 📤 Upload edited audio to R2
    // --------------------------------------------------------
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
