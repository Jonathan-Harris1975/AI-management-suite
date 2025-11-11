// ============================================================
// 🎚️ editingProcessor — Deep & Mature Tone + Render-Safe Keep-Alive
// ============================================================
//
// ✅ Applies EQ + compression filters for a mature voice tone
// ✅ Uses ffmpeg or ffmpeg-static fallback
// ✅ Automatically triggers silent keep-alive pings to avoid Render idle timeout
// ============================================================

import { info, error } from "#logger.js";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { startKeepAlive, stopKeepAlive } from "../../shared/utils/keepalive.js";

// 🎧 EQ tuned for deeper male/mature tone
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
// 🚀 Core Processor — Applies EQ / compression / loudnorm
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
    info({ sessionId, ffmpegPath }, "🎧 EditingProcessor started — applying EQ chain");

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
    info({ sessionId, bytes: edited.length }, "🎚️ Editing stage complete");
    return edited;

  } catch (err) {
    error({ sessionId, err: err.message }, "💥 Editing failed");
    throw err;

  } finally {
    stopKeepAlive(label); // 🛑 ensure cleanup even if error occurs
    await fs.rm(tmpDir, { recursive: true, force: true });
    info({ sessionId }, "🌙 Keep-alive stopped, temp files cleaned up");
  }
                                                       }
