// ============================================================
// 🎚️ editingProcessor — Deep & Mature Tone + Render-Safe Keep-Alive
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
    throw new Error("❌ ffmpeg not found");
  }
}

export async function editingProcessor(sessionId, merged) {
  const label = `editingProcessor:${sessionId}`;
  startKeepAlive(label, 20000);
  info({ sessionId }, "🎚️ Editing Processor started (keep-alive active)");

  try {
    if (!merged) throw new Error("No merged input for editingProcessor");

    const inputPath =
      typeof merged === "string"
        ? merged
        : merged.localPath || (await downloadFile(merged.url, sessionId));

    const outDir = path.join(os.tmpdir(), "tts_editing");
    await fs.mkdir(outDir, { recursive: true });
    const outputPath = path.join(outDir, `${sessionId}_edited.mp3`);

    const ffmpegPath = await findFfmpeg();
    const args = ["-y", "-i", inputPath, "-af", FILTERS, "-ar", "44100", "-b:a", "192k", outputPath];
    info({ sessionId, args }, "🎛️ Launching ffmpeg for editing");

    await runFfmpeg(ffmpegPath, args);
    const buffer = await fs.readFile(outputPath);
    info({ sessionId, bytes: buffer.length }, "✅ Editing complete");
    return buffer;
  } catch (err) {
    error({ sessionId, err: err.message }, "💥 editingProcessor failed");
    throw err;
  } finally {
    stopKeepAlive(label);
  }
}

async function runFfmpeg(path, args) {
  return new Promise((resolve, reject) => {
    const p = spawn(path, args);
    let stderr = "";
    p.stderr.on("data", d => (stderr += d.toString()));
    p.on("exit", c => (c === 0 ? resolve() : reject(new Error(stderr))));
  });
}

async function downloadFile(url, sessionId) {
  const dir = path.join(os.tmpdir(), "tts_editing", sessionId);
  await fs.mkdir(dir, { recursive: true });
  const dest = path.join(dir, "input.mp3");
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to download merged audio (${res.status})`);
  const buf = Buffer.from(await res.arrayBuffer());
  await fs.writeFile(dest, buf);
  return dest;
}

export default { editingProcessor };
