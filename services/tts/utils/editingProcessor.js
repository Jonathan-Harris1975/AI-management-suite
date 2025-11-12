// ============================================================
// 🎚️ editingProcessor — TTS Audio Enhancement for AWS Polly (Brian Voice)
// ============================================================
//
// ✅ Applies EQ + compression to enhance Polly TTS output
// ✅ Removes loudnorm and filtering (handled in final mix)
// ✅ Uses ffmpeg or ffmpeg-static fallback
// ✅ Automatically triggers silent keep-alive pings to avoid Render idle timeout
// ============================================================

import { info, error } from "#logger.js";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { startKeepAlive, stopKeepAlive } from "../../shared/utils/keepalive.js";

// 🎧 EQ chain optimized for AWS Polly Brian voice
// Adds warmth, body, and reduces synthetic artifacts
const FILTERS = [
  "bass=g=6",                                          // Boost low-end warmth
  "treble=g=-2",                                       // Smooth harsh highs
  "equalizer=f=180:width_type=o:width=2:g=4",         // Add body/fullness
  "equalizer=f=2800:width_type=o:width=2:g=-3",       // Reduce nasal quality
  "acompressor=threshold=-20dB:ratio=4:attack=15:release=200:makeup=6" // Control dynamics
].join(",");

// ------------------------------------------------------------
// 🧩 Helper — Locate ffmpeg (system or static)
// ------------------------------------------------------------
async function findFfmpeg() {
  try {
    await new Promise((res, rej) => {
      const p = spawn("ffmpeg", ["-version"]);
      p.once("error", rej);
      p.once("exit", c => (c === 0 ? res() : rej(new Error("ffmpeg exit"))));
    });
    return "ffmpeg";
  } catch {
    const mod = await import("ffmpeg-static").catch(() => null);
    if (mod?.default) return mod.default;
    throw new Error("❌ ffmpeg binary not found (system or static)");
  }
}

// ------------------------------------------------------------
// 🚀 Core Processor — Applies EQ and compression to TTS audio
// ------------------------------------------------------------
export async function editingProcessor(sessionId, merged) {
  const label = `editingProcessor:${sessionId}`;
  startKeepAlive(label, 20000); // 🟢 ping every 20s during ffmpeg run

  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "edit-"));
  const inputPath = path.join(tmpDir, "input.wav");
  const outputPath = path.join(tmpDir, "output.wav");

  await fs.writeFile(inputPath, merged.buffer);

  try {
    const ffmpegPath = await findFfmpeg();
    info({ sessionId, ffmpegPath }, "🎧 TTS EditingProcessor started — enhancing Polly audio");

    await new Promise((resolve, reject) => {
      const proc = spawn(ffmpegPath, [
        "-i", inputPath,
        "-af", FILTERS,
        outputPath,
        "-y"
      ]);

      proc.stdout.on("data", d => process.stdout.write(d.toString()));
      proc.stderr.on("data", d => process.stderr.write(d.toString()));

      proc.once("close", code => {
        if (code === 0) resolve();
        else reject(new Error(`ffmpeg exited with code ${code}`));
      });
    });

    const edited = await fs.readFile(outputPath);
    info({ sessionId, bytes: edited.length }, "🎚️ TTS editing stage complete");
    return edited;

  } catch (err) {
    error({ sessionId, err: err.message }, "💥 TTS editing failed");
    throw err;

  } finally {
    stopKeepAlive(label); // 🛑 ensure cleanup even if error occurs
    await fs.rm(tmpDir, { recursive: true, force: true });
    info({ sessionId }, "🌙 Keep-alive stopped, temp files cleaned up");
  }
}
