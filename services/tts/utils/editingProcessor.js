// ============================================================
// 🎙️ Podcast Editing Processor — Warm, Deep, Human Tone
// ============================================================
//
// • Slight pitch drop for deeper tone
// • Warmth boost around 150–200 Hz
// • Clarity boost around 3–4 kHz
// • High-pass + low-pass to remove digital harshness
// • Gentle podcast compression
// • Clean fallback logic
// • Keepalive integration
// ============================================================

import fs from "fs";
import path from "path";
import { spawn } from "child_process";
import { info, warn, error } from "#logger.js";
import { startKeepAlive, stopKeepAlive } from "#shared/keepalive.js";

const TMP_DIR = "/tmp/tts_editing";

// Ensure /tmp directory exists
function ensureTmpDir() {
  if (!fs.existsSync(TMP_DIR)) {
    fs.mkdirSync(TMP_DIR, { recursive: true });
  }
}

// ------------------------------------------------------------
// 🎚️ Run ffmpeg with podcast enhancement filters
// ------------------------------------------------------------
function runFfmpegPodcastEnhance(inputPath, outputPath, sessionId) {
  return new Promise((resolve, reject) => {
    // PODCAST ENHANCEMENT CHAIN (NO LOUDNORM)
    const filterChain = [
      // Slight pitch drop (≈ -1.5%)
      "asetrate=48000*0.985,aresample=48000",

      // Warmth (body)
      "equalizer=f=170:t=h:width=200:g=3.5",

      // Speech clarity (bite)
      "equalizer=f=3500:t=h:width=200:g=2",

      // Remove rumble
      "highpass=f=65",

      // Smooth harsh TTS digital top end
      "lowpass=f=13500",

      // Gentle podcast compression
      "acompressor=threshold=-14dB:ratio=2.2:attack=6:release=200:makeup=3"
    ].join(",");

    const args = [
      "-y",
      "-i",
      inputPath,
      "-af",
      filterChain,
      "-c:a",
      "libmp3lame",
      "-b:a",
      "192k",
      outputPath,
    ];

    info("🎚️ Starting podcast ffmpeg enhancement", { sessionId, args });

    const ff = spawn("ffmpeg", args);

    ff.on("spawn", () => {
      info("🎬 ffmpeg (podcast enhance) spawned", { sessionId });
    });

    ff.stderr?.on("data", (chunk) => {
      const txt = chunk.toString();
      if (txt.includes("rror") || txt.includes("Error")) {
        warn("⚠️ ffmpeg stderr reported issue (podcast enhance)", {
          sessionId,
        });
      }
    });

    ff.on("error", (err) => {
      error("💥 ffmpeg spawn error (podcast enhance)", {
        sessionId,
        error: err.message,
      });
      reject(err);
    });

    ff.on("close", (code) => {
      if (code === 0) {
        info("✅ ffmpeg podcast enhancement completed", {
          sessionId,
          outputPath,
        });
        resolve();
      } else {
        error("💥 ffmpeg closed with non-zero exit (podcast enhance)", {
          sessionId,
          code,
        });
        reject(new Error(`ffmpeg exited with code ${code}`));
      }
    });
  });
}

// ============================================================
// 🎛️ Main Editing Processor
// ============================================================
async function editingProcessor(sessionId, merged) {
  const label = `editingProcessor:${sessionId}`;
  ensureTmpDir();

  if (!merged || !merged.localPath) {
    throw new Error("editingProcessor: merged.localPath is required.");
  }

  const inputPath = merged.localPath;
  const editedPath = path.join(TMP_DIR, `${sessionId}_edited.mp3`);

  startKeepAlive(label, 25000);

  try {
    // Apply podcast enhancement filters
    await runFfmpegPodcastEnhance(inputPath, editedPath, sessionId);

    const editedBuffer = await fs.promises.readFile(editedPath);

    info("🎧 Podcast editing stage produced buffer", {
      sessionId,
      bytes: editedBuffer.length,
    });

    stopKeepAlive(label);
    return editedBuffer;
  } catch (err) {
    error("💥 editingProcessor failed — using fallback audio", {
      sessionId,
      error: err.message,
    });

    // -----------------------------
    // Fallback = unedited merged file
    // -----------------------------
    try {
      const fallbackBuffer = await fs.promises.readFile(inputPath);

      warn("⚠️ Using unedited merged audio fallback", {
        sessionId,
        bytes: fallbackBuffer.length,
      });

      stopKeepAlive(label);
      return fallbackBuffer;
    } catch (fallbackErr) {
      error("💥 editingProcessor fallback also failed", {
        sessionId,
        error: fallbackErr.message,
      });

      stopKeepAlive(label);
      throw fallbackErr;
    }
  }
}

export { editingProcessor };
export default editingProcessor;
