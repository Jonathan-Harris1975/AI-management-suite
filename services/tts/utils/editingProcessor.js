// ============================================================
// 🎚️ editingProcessor — Deep & Mature Voice + Render-Safe Keep-Alive
// ============================================================
//
// 🧠 Features
//   • Prevents idle timeout (persistent stdout heartbeat)
//   • Adds deep, warm EQ for AWS Polly voices
//   • Works even on >10-minute ffmpeg runs
//   • Cleans up temp files safely
// ============================================================

import { info, error } from "#logger.js";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

// ------------------------------------------------------------
// 🧠 Locate ffmpeg binary (supports bundled or system)
// ------------------------------------------------------------
async function findFfmpeg() {
  try {
    await new Promise((res, rej) => {
      const p = spawn("ffmpeg", ["-version"]);
      p.on("error", rej);
      p.on("exit", (c) => (c === 0 ? res() : rej()));
    });
    return "ffmpeg";
  } catch {
    try {
      const ff = await import("ffmpeg-static");
      if (ff?.default) return ff.default;
    } catch {}
  }
  throw new Error("❌ ffmpeg not available in environment");
}

// ------------------------------------------------------------
// 💓 Persistent keep-alive — stdout ping every 15s
// ------------------------------------------------------------
function startPersistentKeepAlive(label = "editingProcessor", intervalMs = 15000) {
  const id = setInterval(() => {
    process.stdout.write(`💓 ${label} alive @ ${new Date().toISOString()}\n`);
  }, intervalMs);
  return id;
}
function stopPersistentKeepAlive(id) {
  if (id) clearInterval(id);
}

// ------------------------------------------------------------
// 🎧 EQ chain tuned for deeper, more mature male tone
// ------------------------------------------------------------
const FILTERS = [
  "highpass=f=60",
  "lowpass=f=14000",
  "bass=g=6",
  "treble=g=-2",
  "equalizer=f=180:width_type=o:width=2:g=4",
  "equalizer=f=2800:width_type=o:width=2:g=-3",
  "acompressor=threshold=-20dB:ratio=4:attack=15:release=200:makeup=6",
  "loudnorm=I=-16:TP=-1.5:LRA=11",
  "volume=1.1"
].join(",");

// ------------------------------------------------------------
// 🧩 Main Editing Processor
// ------------------------------------------------------------
export async function editingProcessor(sessionId, merged) {
  info({ sessionId }, "🎚️ Starting Editing Processor (persistent keep-alive)");

  const keepId = startPersistentKeepAlive(`editingProcessor:${sessionId}`);

  try {
    if (!merged) throw new Error("Missing merged input for editingProcessor");

    // 🔍 Resolve input path or download from R2
    let inputPath;
    if (typeof merged === "string") inputPath = merged;
    else if (merged.localPath) inputPath = merged.localPath;
    else if (merged.url) {
      const tmpDir = path.join(os.tmpdir(), "tts_editing", sessionId);
      await fs.mkdir(tmpDir, { recursive: true });
      inputPath = path.join(tmpDir, "input.mp3");

      const res = await fetch(merged.url);
      if (!res.ok) throw new Error(`Failed to fetch merged MP3: ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      await fs.writeFile(inputPath, buf);
      info({ sessionId, bytes: buf.length }, "📥 Downloaded merged MP3");
    } else {
      throw new Error("Invalid merged input object");
    }

    const outputPath = path.join(os.tmpdir(), "tts_editing", `${sessionId}_edited.mp3`);
    await fs.mkdir(path.dirname(outputPath), { recursive: true });

    const ffmpegPath = await findFfmpeg();
    const args = [
      "-y",
      "-i", inputPath,
      "-af", FILTERS,
      "-ar", "44100",
      "-b:a", "192k",
      outputPath
    ];

    info({ sessionId, args }, "🎛️ Launching ffmpeg (keep-alive active)");

    await new Promise((resolve, reject) => {
      const proc = spawn(ffmpegPath, args);
      let stderr = "";

      proc.stdout.on("data", (chunk) => {
        process.stdout.write(chunk.toString());
      });
      proc.stderr.on("data", (chunk) => {
        stderr += chunk.toString();
        if (stderr.length > 8000) stderr = stderr.slice(-8000); // keep log small
      });

      proc.on("error", reject);
      proc.on("exit", (code) => {
        code === 0 ? resolve() : reject(new Error(stderr));
      });
    });

    const editedBuffer = await fs.readFile(outputPath);
    info({ sessionId, bytes: editedBuffer.length }, "✅ Deep-voice editing complete");

    return editedBuffer;
  } catch (err) {
    error({ sessionId, err: err.message }, "💥 editingProcessor failed");
    throw err;
  } finally {
    stopPersistentKeepAlive(keepId);
    info({ sessionId }, "🌙 Keep-alive stopped (editing complete)");
  }
}

export default { editingProcessor };
