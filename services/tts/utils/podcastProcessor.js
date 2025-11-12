// ============================================================
// 🎧 podcastProcessor — Studio-Quality Final Master Mix
// ============================================================
//
// ✅ Professional audio chain: Gate → EQ → Compression → De-esser → Limiter → Loudnorm
// ✅ Intro/outro with musical fades
// ✅ Studio-grade 256kbps output
// ✅ Optimized for podcast distribution (Spotify, Apple Podcasts, etc.)
// ============================================================

import { info, error } from "#logger.js";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn, execFile } from "node:child_process";
import { startKeepAlive, stopKeepAlive } from "../../shared/utils/keepalive.js";
import { uploadBuffer, buildPublicUrl, getObjectAsText } from "#shared/r2-client.js;
import ffprobePath from "ffprobe-static";

const INTRO_URL = process.env.PODCAST_INTRO_URL;
const OUTRO_URL = process.env.PODCAST_OUTRO_URL;
const MIN_INTRO_DURATION = parseFloat(process.env.MIN_INTRO_DURATION || "3");
const MIN_OUTRO_DURATION = parseFloat(process.env.MIN_OUTRO_DURATION || "3");
const FINAL_BUCKET_KEY = "podcast";
const META_BUCKET_KEY = process.env.R2_META_BUCKET || "podcast-meta";

// 🎚️ Studio-grade audio processing chain
const STUDIO_FILTERS = [
  "agate=threshold=-50dB:ratio=10:attack=5:release=150",
  "highpass=f=80:poles=2",
  "equalizer=f=3500:width_type=o:width=1.5:g=3",
  "equalizer=f=300:width_type=o:width=2:g=-2",
  "treble=g=-1",
  "equalizer=f=7000:width_type=o:width=1:g=-4",
  "acompressor=threshold=-18dB:ratio=3:attack=20:release=250:makeup=4",
  "lowpass=f=14000:poles=2",
  "alimiter",
  "loudnorm=I=-14:TP=-1:LRA=11"
];

async function runFfmpeg(ffmpegPath, args) {
  return new Promise((resolve, reject) => {
    const ff = spawn(ffmpegPath, args);
    ff.on("close", code => (code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}`))));
  });
}

async function findFfmpeg() {
  const mod = await import("ffmpeg-static");
  if (mod?.default) return mod.default;
  throw new Error("❌ ffmpeg not found");
}

export async function podcastProcessor(sessionId, editedBuffer) {
  const label = `podcastProcessor:${sessionId}`;
  startKeepAlive(label, 20000);
  info({ sessionId }, "🎧 Starting Studio-Quality Podcast Processor");

  try {
    const tmpDir = path.join(os.tmpdir(), "tts_podcast", sessionId);
    await fs.mkdir(tmpDir, { recursive: true });
    const mainPath = path.join(tmpDir, "edited.mp3");
    const introPath = path.join(tmpDir, "intro.mp3");
    const outroPath = path.join(tmpDir, "outro.mp3");
    const introFadedPath = path.join(tmpDir, "intro_faded.mp3");
    const outroFadedPath = path.join(tmpDir, "outro_faded.mp3");
    const outputPath = path.join(tmpDir, `${sessionId}_final.mp3`);

    await fs.writeFile(mainPath, editedBuffer);
    const ffmpegPath = await findFfmpeg();

    const parts = [mainPath];
    if (INTRO_URL) {
      try {
        const res = await fetch(INTRO_URL);
        const buf = Buffer.from(await res.arrayBuffer());
        await fs.writeFile(introPath, buf);
        await applyFadeOut(ffmpegPath, introPath, introFadedPath, MIN_INTRO_DURATION);
        parts.unshift(introFadedPath);
      } catch {}
    }
    if (OUTRO_URL) {
      try {
        const res = await fetch(OUTRO_URL);
        const buf = Buffer.from(await res.arrayBuffer());
        await fs.writeFile(outroPath, buf);
        await applyFadeIn(ffmpegPath, outroPath, outroFadedPath, MIN_OUTRO_DURATION);
        parts.push(outroFadedPath);
      } catch {}
    }

    const listFile = path.join(tmpDir, "concat.txt");
    const concatLines = parts.map(p => `file '${p}'`).join("\n");
    await fs.writeFile(listFile, concatLines);

    const args = [
      "-f", "concat",
      "-safe", "0",
      "-i", listFile,
      "-af", STUDIO_FILTERS.join(","),
      "-b:a", "256k",
      "-compression_level", "0",
      outputPath
    ];
    await runFfmpeg(ffmpegPath, args);

    const finalBuf = await fs.readFile(outputPath);
    await uploadBuffer(FINAL_BUCKET_KEY, `${sessionId}.mp3`, finalBuf, "audio/mpeg");
    const url = buildPublicUrl(FINAL_BUCKET_KEY, `${sessionId}.mp3`);

    // 🕵️ Silent metadata update after upload
    try {
      const duration = await getAudioDuration(outputPath);
      const stats = await fs.stat(outputPath);
      const fileSizeMB = +(stats.size / (1024 * 1024)).toFixed(1);

      let meta = {};
      try {
        const metaText = await getObjectAsText(META_BUCKET_KEY, `${sessionId}.json`);
        meta = JSON.parse(metaText);
      } catch {}

      meta.audioDuration = duration;
      meta.fileSizeMB = fileSizeMB;

      await uploadBuffer(META_BUCKET_KEY, `${sessionId}.json`, Buffer.from(JSON.stringify(meta, null, 2)), "application/json");
    } catch {}

    info({ sessionId, url }, "✅ Studio-quality podcast uploaded");
    return finalBuf;

  } catch (err) {
    error({ sessionId, err: err.message }, "💥 podcastProcessor failed");
    throw err;
  } finally {
    stopKeepAlive(label);
  }
}

// ------------------------------------------------------------
// Helpers
// ------------------------------------------------------------
async function applyFadeOut(ffmpeg, inputPath, outputPath, duration) {
  const args = ["-i", inputPath, "-af", `afade=t=out:st=0:d=${duration}`, outputPath];
  await runFfmpeg(ffmpeg, args);
}

async function applyFadeIn(ffmpeg, inputPath, outputPath, duration) {
  const args = ["-i", inputPath, "-af", `afade=t=in:st=0:d=${duration}`, outputPath];
  await runFfmpeg(ffmpeg, args);
}

async function getAudioDuration(filePath) {
  return new Promise((resolve, reject) => {
    execFile(ffprobePath.path, [
      "-v", "error",
      "-show_entries", "format=duration",
      "-of", "default=noprint_wrappers=1:nokey=1",
      filePath
    ], (err, stdout) => {
      if (err) return reject(err);
      const seconds = parseFloat(stdout.trim());
      if (isNaN(seconds)) return resolve("00:00:00");
      const h = Math.floor(seconds / 3600);
      const m = Math.floor((seconds % 3600) / 60);
      const s = Math.floor(seconds % 60);
      resolve(`${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`);
    });
  });
                                 }
