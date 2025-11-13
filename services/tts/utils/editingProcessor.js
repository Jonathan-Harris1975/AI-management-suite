// ============================================================
// 🎙️ STREAMING Editing Processor — Premium Radio Host Version
// Zero OOM • Full ffmpeg Protection • Safe Fallback
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
// ⭐ PREMIUM RADIO HOST FILTER CHAIN
// ------------------------------------------------------------
const filters = [
  // Slight mature depth (safe pitch)
  "asetrate=44100*0.982,aresample=44100",

  // Warmth + De-harshing
  "firequalizer=gain_entry='entry(85,4);entry(180,3);entry(320,2);entry(900,-2);entry(2800,-1)'",

  // Presence boost (radio clarity)
  "equalizer=f=4500:width_type=o:width=1.5:g=2",

  // Smooth de-essing
  "deesser=i=0.4",

  // Broadcast compression
  "acompressor=threshold=-17dB:ratio=4:attack=8:release=200:makeup=4",

  // Leveling to radio consistency
  "dynaudnorm=f=200:n=0:p=0.80:s=10",
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
    "🎚️ Starting streaming editingProcessor (Premium Radio Host Tone)"
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
      { sessionId, key },
      "💾 Uploaded edited MP3 to R2 (Premium Radio Host Tone)"
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
