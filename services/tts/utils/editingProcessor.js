// ============================================================
// 🎚️ editingProcessor — Deep & Mature Voice Enhancement (AWS Polly)
// ============================================================
//
// 🎯 Goals:
//   • Add warmth and body (~150–350 Hz boost)
//   • Slightly soften top-end (~6–8 kHz rolloff)
//   • Preserve clarity and avoid metallic artifacts
//   • Maintain podcast-level loudness (-16 LUFS)
// ============================================================

import { info, warn } from "#logger.js";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

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
// 🎧 EQ / compression chain tuned for "mature" tone
// ------------------------------------------------------------
//
//  equalizer=f=200:width_type=o:width=2:g=4   -> warmth boost
//  equalizer=f=3000:width_type=o:width=2:g=-2 -> soften harshness
//  bass=g=4                                   -> low-end reinforcement
//  treble=g=-1                                -> gentle high rolloff
//  loudnorm + compressor                      -> controlled loudness
//
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
// 🧠 Main
// ------------------------------------------------------------
export async function editingProcessor(sessionId, merged) {
  info({ sessionId }, "🎚️ Starting Deep Voice EditingProcessor (Polly)");

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
}

export default { editingProcessor };,
