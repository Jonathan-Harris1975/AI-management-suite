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
import { spawn } from "node:child_process";
import { startKeepAlive, stopKeepAlive } from "../../shared/utils/keepalive.js";
import { putObject, buildPublicUrl } from "#shared/r2-client.js";

const INTRO_URL = process.env.PODCAST_INTRO_URL;
const OUTRO_URL = process.env.PODCAST_OUTRO_URL;
const MIN_INTRO_DURATION = parseFloat(process.env.MIN_INTRO_DURATION || "3");
const MIN_OUTRO_DURATION = parseFloat(process.env.MIN_OUTRO_DURATION || "3");
const FINAL_BUCKET_KEY = "podcast";

// 🎚️ Studio-grade audio processing chain
const STUDIO_FILTERS = [
  // 1️⃣ Noise Gate - Remove background noise and silence
  "agate=threshold=-50dB:ratio=10:attack=5:release=150",
  
  // 2️⃣ High-pass filter - Remove rumble and low-frequency noise
  "highpass=f=80:poles=2",
  
  // 3️⃣ Presence boost - Add clarity and intelligibility (3-5kHz)
  "equalizer=f=3500:width_type=o:width=1.5:g=3",
  
  // 4️⃣ De-muddy - Reduce boxiness (200-400Hz)
  "equalizer=f=300:width_type=o:width=2:g=-2",
  
  // 5️⃣ De-esser - Tame harsh sibilance (6-8kHz)
  "treble=g=-1",
  "equalizer=f=7000:width_type=o:width=1:g=-4",
  
  // 6️⃣ Multiband-style compression - Control dynamics
  "acompressor=threshold=-18dB:ratio=3:attack=20:release=250:makeup=4",
  
  // 7️⃣ Low-pass filter - Remove ultra-highs that can sound harsh
  "lowpass=f=14000:poles=2",
  
  // 8️⃣ Brick-wall limiter - Prevent clipping
  "alimiter=limit=-2dB:attack=5:release=50",
  
  // 9️⃣ Final loudness normalization - EBU R128 broadcast standard
  "loudnorm=I=-16:TP=-1.5:LRA=11:print_format=summary"
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

    // Download and process intro/outro with musical fades
    const parts = [mainPath];
    
    if (INTRO_URL) {
      await downloadIfExists(INTRO_URL, introPath);
      const introExists = await fs.stat(introPath).catch(() => null);
      if (introExists) {
        info({ sessionId }, "🎵 Processing intro with fade-out");
        await applyFadeOut(ffmpegPath, introPath, introFadedPath, MIN_INTRO_DURATION);
        parts.unshift(introFadedPath);
      }
    }

    if (OUTRO_URL) {
      await downloadIfExists(OUTRO_URL, outroPath);
      const outroExists = await fs.stat(outroPath).catch(() => null);
      if (outroExists) {
        info({ sessionId }, "🎵 Processing outro with fade-in");
        await applyFadeIn(ffmpegPath, outroPath, outroFadedPath, MIN_OUTRO_DURATION);
        parts.push(outroFadedPath);
      }
    }

    // Build concat list
    const concatList = path.join(tmpDir, "concat.txt");
    await fs.writeFile(concatList, parts.map(p => `file '${p}'`).join("\n"));

    // Final master with studio-grade processing
    const args = [
      "-y",
      "-f", "concat",
      "-safe", "0",
      "-i", concatList,
      "-af", STUDIO_FILTERS,
      "-codec:a", "libmp3lame",
      "-b:a", "256k",        // Studio quality bitrate
      "-q:a", "0",           // Highest quality VBR setting
      "-compression_level", "0",  // Best compression quality
      outputPath
    ];

    info({ sessionId }, "🎛️ Applying studio-grade audio processing chain");
    await runFfmpeg(ffmpegPath, args);

    const finalBuf = await fs.readFile(outputPath);
    await putObject(FINAL_BUCKET_KEY, `${sessionId}.mp3`, finalBuf, "audio/mpeg");
    const url = buildPublicUrl(FINAL_BUCKET_KEY, `${sessionId}.mp3`);
    info({ sessionId, url }, "✅ Studio-quality podcast uploaded");
    return finalBuf;
    
  } catch (err) {
    error({ sessionId, err: err.message }, "💥 podcastProcessor failed");
    throw err;
  } finally {
    stopKeepAlive(label);
  }
}

// Apply fade-out to intro music
async function applyFadeOut(ffmpeg, inputPath, outputPath, fadeDuration) {
  const duration = await getAudioDuration(ffmpeg, inputPath);
  const fadeStart = Math.max(0, duration - fadeDuration);
  
  const args = [
    "-y",
    "-i", inputPath,
    "-af", `afade=t=out:st=${fadeStart}:d=${fadeDuration}`,
    "-codec:a", "libmp3lame",
    "-b:a", "256k",
    outputPath
  ];
  
  await runFfmpeg(ffmpeg, args);
}

// Apply fade-in to outro music
async function applyFadeIn(ffmpeg, inputPath, outputPath, fadeDuration) {
  const args = [
    "-y",
    "-i", inputPath,
    "-af", `afade=t=in:st=0:d=${fadeDuration}`,
    "-codec:a", "libmp3lame",
    "-b:a", "256k",
    outputPath
  ];
  
  await runFfmpeg(ffmpeg, args);
}

// Get audio file duration
async function getAudioDuration(ffmpeg, filePath) {
  return new Promise((resolve, reject) => {
    const args = ["-i", filePath, "-f", "null", "-"];
    const p = spawn(ffmpeg, args);
    let stderr = "";
    
    p.stderr.on("data", d => (stderr += d.toString()));
    
    p.on("exit", () => {
      const match = stderr.match(/Duration: (\d{2}):(\d{2}):(\d{2}\.\d{2})/);
      if (match) {
        const hours = parseInt(match[1]);
        const minutes = parseInt(match[2]);
        const seconds = parseFloat(match[3]);
        const duration = hours * 3600 + minutes * 60 + seconds;
        resolve(duration);
      } else {
        reject(new Error("Could not determine audio duration"));
      }
    });
  });
}

async function runFfmpeg(ffmpeg, args) {
  return new Promise((resolve, reject) => {
    const p = spawn(ffmpeg, args);
    let stderr = "";
    p.stderr.on("data", d => (stderr += d.toString()));
    p.on("exit", c => (c === 0 ? resolve() : reject(new Error(stderr))));
  });
}

async function downloadIfExists(url, dest) {
  if (!url) return;
  const res = await fetch(url);
  if (res.ok) {
    const buf = Buffer.from(await res.arrayBuffer());
    await fs.writeFile(dest, buf);
  }
}

export default { podcastProcessor };
