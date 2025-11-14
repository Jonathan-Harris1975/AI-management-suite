// ============================================================
// 🎚️ Editing Processor — Hybrid Mastering (Stage 1)
// ============================================================
//
// Pipeline Purpose:
//  • Improve TTS naturalness (de-ess, soften harsh TTS peaks)
//  • Remove noise/clicks/artifacts
//  • Loudnorm pre-pass (-18 LUFS target)
//  • Light compression for natural speech-rolloff
//  • DO NOT add fades (handled later)
//  • DO NOT add intro/outro (podcastProcessor handles this)
//
// Includes:
//  • Local retry logic
//  • Keep-alive signals
//  • R2 safenet upload -> R2_BUCKET_EDITED_AUDIO
//
// Returns:
//   Buffer (clean mastered TTS audio)
//
// ============================================================

import fs from "fs";
import path from "path";
import { spawn } from "child_process";
import { info, warn, error } from "#logger.js";
import { startKeepAlive, stopKeepAlive } from "#shared/keepalive.js";
import { putObject } from "#shared/r2-client.js";

// ------------------------------------------------------------
// ⚙️ ENV
// ------------------------------------------------------------
const TMP_DIR = "/tmp/edited_audio";

const MAX_RETRIES = Number(process.env.MAX_CHUNK_RETRIES || 3);
const RETRY_DELAY_MS = Number(process.env.RETRY_DELAY_MS || 2000);
const RETRY_BACKOFF = Number(process.env.RETRY_BACKOFF_MULTIPLIER || 2);

const EDITED_BUCKET = process.env.R2_BUCKET_EDITED_AUDIO || "";
const PUBLIC_EDITED_BASE =
  process.env.R2_PUBLIC_BASE_URL_EDITED_AUDIO || "";

// Ensure temporary directory exists
if (!fs.existsSync(TMP_DIR)) {
  fs.mkdirSync(TMP_DIR, { recursive: true });
}

// ------------------------------------------------------------
// 🔧 Stage 1 Mastering Chain (anti-robotic TTS improvement)
// ------------------------------------------------------------
//
// Order matters:
//  1. High-pass filter (remove sub-bass rumble)
//  2. De-esser to soften robotic hiss (ffmpeg hack via bandreject)
//  3. Light compression (smooth harsh edges)
//  4. Loudnorm pre-stage (Stage 1)
// ------------------------------------------------------------
function ffmpegStage1Filter() {
  return [
    // Clean sub-rumble
    "highpass=f=110",

    // TTS anti-robotic trick: narrow band-reject around 6–8 kHz
    // Removes metallic edge typical of synthetic voices
    "anequalizer=f=7000:t=h:width=200:g=-6",

    // Natural-sounding gentle compression
    "acompressor=threshold=-20dB:ratio=2:attack=10:release=80",

    // Stage 1 loudnorm (pre-normalization)
    "loudnorm=I=-18:TP=-2:LRA=11:print_format=none"
  ].join(",");
}

// ------------------------------------------------------------
// 🔁 Run ffmpeg Once
// ------------------------------------------------------------
function runEditingOnce(sessionId, inputPath, outputPath, attempt, total) {
  const filters = ffmpegStage1Filter();

  const args = [
    "-y",
    "-i", inputPath,
    "-filter:a", filters,
    "-c:a", "libmp3lame",
    "-b:a", "128k",
    outputPath,
  ];

  return new Promise((resolve, reject) => {
    info("🎚️ Starting editingProcessor ffmpeg attempt", {
      sessionId,
      attempt,
      total,
      args,
    });

    const ff = spawn("ffmpeg", args);

    ff.stderr.on("data", (buf) => {
      const txt = buf.toString().toLowerCase();
      if (txt.includes("error")) {
        warn("⚠️ ffmpeg stderr warning (editingProcessor)", {
          sessionId,
          attempt,
          stderr: txt,
        });
      }
    });

    ff.on("error", (err) => {
      reject(err);
    });

    ff.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exited with code ${code}`));
    });
  });
}

// ------------------------------------------------------------
// 🎧 editingProcessor — Main
// ------------------------------------------------------------
export async function editingProcessor(sessionId, audioBuffer) {
  const label = `editingProcessor:${sessionId}`;
  startKeepAlive(label, { intervalMs: 15000 });

  const inputPath = path.join(TMP_DIR, `${sessionId}_raw.mp3`);
  const outputPath = path.join(TMP_DIR, `${sessionId}_edited.mp3`);

  await fs.promises.writeFile(inputPath, audioBuffer);

  let finalBuffer = null;
  let lastError = null;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      await runEditingOnce(sessionId, inputPath, outputPath, attempt, MAX_RETRIES);

      finalBuffer = await fs.promises.readFile(outputPath);

      info("✅ editingProcessor produced cleaned audio", {
        sessionId,
        bytes: finalBuffer.length,
        attempt,
      });

      break;
    } catch (err) {
      lastError = err;

      warn("⚠️ editingProcessor ffmpeg attempt failed", {
        sessionId,
        attempt,
        error: err.message,
        nextRetryMs: attempt < MAX_RETRIES
          ? RETRY_DELAY_MS * Math.pow(RETRY_BACKOFF, attempt - 1)
          : 0,
      });

      if (attempt < MAX_RETRIES) {
        const delay = RETRY_DELAY_MS * Math.pow(RETRY_BACKOFF, attempt - 1);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  stopKeepAlive(label);

  // If all attempts failed → return original buffer (fail-safe)
  if (!finalBuffer) {
    error("💥 editingProcessor failed after all retries — returning raw audio", {
      sessionId,
      error: lastError?.message,
    });
    return audioBuffer;
  }

  // ------------------------------------------------------------
  // 📦 Safenet Upload to Edited Bucket
  // ------------------------------------------------------------
  if (EDITED_BUCKET && PUBLIC_EDITED_BASE) {
    try {
      const key = `${sessionId}_edited.mp3`;
      await putObject("edited", key, finalBuffer, "audio/mpeg");

      info("💾 editingProcessor safenet upload complete", {
        sessionId,
        bucket: EDITED_BUCKET,
        key,
        url: `${PUBLIC_EDITED_BASE}/${encodeURIComponent(key)}`,
      });
    } catch (err) {
      warn("⚠️ editingProcessor safenet upload failed", {
        sessionId,
        error: err.message,
      });
    }
  }

  return finalBuffer;
}

export default editingProcessor;
