// ============================================================
// 🎙️ Podcast Editing Processor — Warm, Natural, Deeper Tone
// ============================================================
//
// Style A: natural, intimate podcast voice
//
// • Slight pitch drop for deeper tone (but not slow)
// • High-pass + low-pass to remove rumble & harshness
// • Gentle dynamic smoothing using compand (ffmpeg-safe)
// • Small volume lift for comfortable listening
// • Shiper/Render-safe filter set (no equalizer/acompressor)
// • Keepalive + fallback to unedited audio on failure
// ============================================================

import fs from "fs";
import path from "path";
import { spawn } from "child_process";
import { info, warn, error } from "#logger.js";
import { startKeepAlive, stopKeepAlive } from "#shared/keepalive.js";

const TMP_DIR = "/tmp/tts_editing";

// Ensure /tmp editing directory exists
function ensureTmpDir() {
  if (!fs.existsSync(TMP_DIR)) {
    fs.mkdirSync(TMP_DIR, { recursive: true });
  }
}

// ------------------------------------------------------------
// 🎚️ Run ffmpeg with PODCAST-SAFE enhancement filters
// ------------------------------------------------------------
//
// Filter chain (all safe on lean ffmpeg builds):
//
// 1) asetrate=48000*0.985,aresample=48000
//    → subtle pitch drop (~ -1.5%), keeps tempo natural
//
// 2) highpass=f=70
//    → remove low rumble / mud
//
// 3) lowpass=f=13500
//    → soften sharp digital top end
//
// 4) compand=...
//    → gentle dynamic smoothing, like light compression
//
// 5) volume=1.8
//    → comfortable podcast listening level
// ------------------------------------------------------------
function runFfmpegPodcastEnhance(inputPath, outputPath, sessionId) {
  return new Promise((resolve, reject) => {
    const filterChain = [
      // Slightly deeper tone via tiny pitch drop
      "asetrate=48000*0.985,aresample=48000",

      // Clean up extremes
      "highpass=f=70",
      "lowpass=f=13500",

      // Gentle dynamics: make quiet bits a bit louder,
      // bright bits a bit softer (podcast-style smoothness)
      "compand=attacks=0:points=-80/-80|-40/-32|-20/-14|0/-2|20/0",

      // Small overall lift
      "volume=1.8",
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

      // Only escalate if there's a real error word
      if (txt.toLowerCase().includes("error") || txt.toLowerCase().includes("invalid")) {
        warn("⚠️ ffmpeg stderr reported potential problem (podcast enhance)", {
          sessionId,
          stderr: txt.trim(),
        });
      }
      // Otherwise, it's usually just progress chatter; ignore to avoid noise
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
        const msg = `ffmpeg exited with code ${code}`;
        error("💥 ffmpeg closed with non-zero exit (podcast enhance)", {
          sessionId,
          code,
        });
        reject(new Error(msg));
      }
    });
  });
}

// ============================================================
// 🎛️ Main Editing Processor
// ============================================================
//
// Called from orchestrator as:
//   const editedBuffer = await editingProcessor(sessionId, merged);
//
// where `merged` is:
//   { key, localPath } // from mergeProcessor
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
    // Run podcast-safe enhancement
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

    // Fallback to unedited merged audio
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
