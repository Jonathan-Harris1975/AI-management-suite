// ============================================================
// 🎚️ editingProcessor — Deep & Mature Voice + Keep-Alive Integration
// ============================================================
//
// 🧩 Features:
//   • Warm, deeper tone enhancement for AWS Polly
//   • Loudness normalization for podcast standards
//   • Auto heartbeat (prevents Render/Shipr idle restarts)
//   • Graceful cleanup even if ffmpeg fails
// ============================================================

import { info, warn, error } from "#logger.js";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { startSilentKeepAlive, stopSilentKeepAlive } from "#keepalive.js"; // ✅ use the global silent keep-alive

// ------------------------------------------------------------
// 🧠 Locate ffmpeg
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
// 🎧 Deep & mature EQ / compression chain
// ------------------------------------------------------------
const FILTERS = [
  "highpass=f=70",
  "lowpass=f=14000",
  "equalizer=f=200:width_type=o:width=2:g=4",
  "equalizer=f=3000:width_type=o:width=2:g=-2",
  "bass=g=4",
  "treble=g=-1",
  "acompressor=threshold=-20dB:ratio=3:attack=15:release=200:makeup=5",
  "loudnorm=I=-16:TP=-1.5:LRA=11",
  "volume=1.05"
].join(",");

// ------------------------------------------------------------
// 🧩 Main editing processor
// ------------------------------------------------------------
export async function editingProcessor(sessionId, merged) {
  info({ sessionId }, "🎚️ Starting Deep Voice EditingProcessor with Keep-Alive");

  // ✅ Activate keep-alive every 25s (safe interval)
  const label = `editingProcessor:${sessionId}`;
  startSilentKeepAlive(label, 25000);

  try {
    if (!merged) throw new Error("editingProcessor: missing merged input");

    let inputPath;
    if (typeof merged === "string") inputPath = merged;
    else if (merged.localPath) inputPath = merged.localPath;
    else if (merged.url) {
      const tmpDir = path.join(os.tmpdir(), "tts_editing", sessionId);
      await fs.mkdir(tmpDir, { recursive: true });
      inputPath = path.join(tmpDir, "input.mp3");
      const res = await fetch(merged.url);
      if (!res.ok) throw new Error(`Failed to fetch merged mp3: ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      await fs.writeFile(inputPath, buf);
      info({ sessionId, size: buf.length }, "📥 Downloaded merged MP3 for editing");
    } else throw new Error("editingProcessor: invalid input");

    const tmpOut = path.join(os.tmpdir(), "tts_editing", `${sessionId}_edited.mp3`);
    await fs.mkdir(path.dirname(tmpOut), { recursive: true });

    const ffmpegPath = await findFfmpeg();

    const args = [
      "-y",
      "-i", inputPath,
      "-af", FILTERS,
      "-ar", "44100",
      "-b:a", "192k",
      tmpOut
    ];

    info({ sessionId }, "🎛️ ffmpeg process starting (keep-alive engaged)");

    await new Promise((resolve, reject) => {
      const proc = spawn(ffmpegPath, args);
      let stderr = "";
      proc.stderr.on("data", (d) => (stderr += d.toString()));
      proc.on("error", reject);
      proc.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(stderr))));
    });

    const edited = await fs.readFile(tmpOut);
    info({ sessionId, bytes: edited.length }, "✅ Deep & Mature voice enhancement complete");

    return edited;
  } catch (err) {
    error({ sessionId, err: err.message }, "💥 editingProcessor failed");
    throw err;
  } finally {
    // ✅ Stop keep-alive
    stopSilentKeepAlive();
    info({ sessionId }, "🌙 Keep-alive stopped (editing complete)");
  }
}

export default { editingProcessor };
