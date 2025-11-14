// ============================================================
// 🎙️ STREAMING Editing Processor — Mature Deep Voice Edition
// Natural • Authoritative • Broadcast Quality
// ============================================================
//
// Signature:
//   const editedBuffer = await editingProcessor(sessionId, merged);
// Where `merged` is the object returned by mergeProcessor:
//   { key, localPath }
//
// This implementation:
//   - Runs ffmpeg over the merged MP3 (simple loudness normalize)
//   - Returns the edited audio as a Buffer
//   - Falls back to the unedited merged file if editing fails
//   - Uses keep-alive to prevent idle timeouts during long runs
// ============================================================

import fs from "fs";
import path from "path";
import { spawn } from "child_process";
import { info, error, warn } from "#logger.js";
import { startKeepAlive, stopKeepAlive } from "#shared/keepalive.js";

const TMP_DIR = "/tmp/tts_editing";

function ensureTmpDir() {
  if (!fs.existsSync(TMP_DIR)) {
    fs.mkdirSync(TMP_DIR, { recursive: true });
  }
}

function runFfmpegNormalize(inputPath, outputPath, sessionId) {
  return new Promise((resolve, reject) => {
    const args = [
      "-y",
      "-i",
      inputPath,
      // Simple loudness normalization & high-quality MP3 encode
      "-af",
      "loudnorm",
      "-c:a",
      "libmp3lame",
      "-b:a",
      "192k",
      outputPath,
    ];

    info("🎚️ Starting editingProcessor ffmpeg", { sessionId, args });

    const ff = spawn("ffmpeg", args);

    ff.on("spawn", () => {
      info("🎬 ffmpeg (editingProcessor) spawned", { sessionId });
    });

    ff.stdout?.on("data", () => {
      // keep silent: no spam
    });

    ff.stderr?.on("data", (chunk) => {
      // Log only high-level progress markers, not the full spam
      const text = chunk.toString();
      if (text.includes("error") || text.includes("Error")) {
        warn("⚠️ ffmpeg (editingProcessor) stderr reported error text", {
          sessionId,
        });
      }
    });

    ff.on("error", (err) => {
      error("💥 ffmpeg (editingProcessor) spawn error", {
        sessionId,
        error: err.message,
      });
      reject(err);
    });

    ff.on("close", (code) => {
      if (code === 0) {
        info("✅ ffmpeg (editingProcessor) completed successfully", {
          sessionId,
          outputPath,
        });
        resolve(null);
      } else {
        const err = new Error(
          `ffmpeg (editingProcessor) exited with code ${code}`
        );
        error("💥 ffmpeg (editingProcessor) closed with non-zero exit code", {
          sessionId,
          code,
        });
        reject(err);
      }
    });
  });
}

export async function editingProcessor(sessionId, merged) {
  const label = `editingProcessor:${sessionId}`;
  ensureTmpDir();

  if (!merged || !merged.localPath) {
    throw new Error("editingProcessor: merged.localPath is required.");
  }

  const inputPath = merged.localPath;
  const editedPath = path.join(TMP_DIR, `${sessionId}_edited.mp3`);

  startKeepAlive(label, 25000);

  try {
    await runFfmpegNormalize(inputPath, editedPath, sessionId);
    const editedBuffer = await fs.promises.readFile(editedPath);
    info("🎚️ Editing stage produced buffer", {
      sessionId,
      bytes: editedBuffer.length,
    });
    stopKeepAlive(label);
    return editedBuffer;
  } catch (err) {
    error("💥 editingProcessor failed, falling back to unedited merged audio", {
      sessionId,
      error: err.message,
    });

    try {
      const fallbackBuffer = await fs.promises.readFile(inputPath);
      warn("⚠️ Using unedited merged audio as fallback", {
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

export default editingProcessor;
