// ============================================================  
// 🎵 Podcast Processor — Intro/Outro Mixdown & Final Mastering  
// ============================================================  
//
// Signature:  
//   const finalAudio = await podcastProcessor(sessionId, editedBuffer);
//
// Responsibilities:  
// • Download intro & outro MP3s locally
// • Fade-in intro music (MIN_INTRO_DURATION)  
// • Add main edited speech  
// • Fade-out outro music (MIN_OUTRO_DURATION)  
// • Final mastering: acompressor + loudnorm  
// • Retry-safe, keepalive-safe, R2-upload-safe  
// • On failure, return editedBuffer unchanged  
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
const TMP_DIR = "/tmp/podcast_master";

const PODCAST_INTRO_URL = process.env.PODCAST_INTRO_URL || "";
const PODCAST_OUTRO_URL = process.env.PODCAST_OUTRO_URL || "";

// Fade durations (seconds)
const MIN_INTRO_DURATION = Number(process.env.MIN_INTRO_DURATION || 3);
const MIN_OUTRO_DURATION = Number(process.env.MIN_OUTRO_DURATION || 3);

const INTRO_FADE_SEC = Math.max(0.1, MIN_INTRO_DURATION);
const OUTRO_FADE_SEC = Math.max(0.1, MIN_OUTRO_DURATION);

// Retry settings
const MAX_PODCAST_RETRIES = Number(
  process.env.MAX_PODCAST_RETRIES ||
    process.env.MAX_CHUNK_RETRIES ||
    3
);

const PODCAST_RETRY_DELAY_MS = Number(
  process.env.PODCAST_RETRY_DELAY_MS ||
    process.env.RETRY_DELAY_MS ||
    2000
);

const PODCAST_RETRY_BACKOFF = Number(
  process.env.RETRY_BACKOFF_MULTIPLIER || 2
);

// Safenet storage
const EDITED_BUCKET = process.env.R2_BUCKET_EDITED_AUDIO || "";
const PUBLIC_EDITED_BASE =
  process.env.R2_PUBLIC_BASE_URL_EDITED_AUDIO || "";

// Ensure tmp directory exists
if (!fs.existsSync(TMP_DIR)) {
  fs.mkdirSync(TMP_DIR, { recursive: true });
}

// ------------------------------------------------------------
// 📥 Download helper (intro / outro)
// ------------------------------------------------------------
async function downloadToLocal(url, targetPath, label) {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(
      `Failed to download ${label} from ${url} — HTTP ${res.status}`
    );
  }

  const arr = await res.arrayBuffer();
  const buf = Buffer.from(arr);

  if (buf.length < 1000) {
    throw new Error(
      `${label} MP3 from ${url} too small or invalid (bytes=${buf.length})`
    );
  }

  await fs.promises.writeFile(targetPath, buf);

  info(`⬇️ Downloaded ${label} MP3 locally`, {
    url,
    targetPath,
    bytes: buf.length,
  });

  return buf;
}

// ------------------------------------------------------------
// 🧪 ffmpeg mixdown — one attempt (LOCAL FILES ONLY)
// ------------------------------------------------------------
function runPodcastMixdownOnce(
  sessionId,
  introPath,
  mainPath,
  outroPath,
  outputPath,
  attempt,
  total
) {
  return new Promise((resolve, reject) => {
    // All streams → 44.1kHz stereo, then concat, then compressor + loudnorm.
    const filterComplex = [
      // intro: fade-in + format
      `[0:a]afade=t=in:d=${INTRO_FADE_SEC},` +
        `aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=stereo[intro];`,

      // main: ensure same format
      `[1:a]aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=stereo[main];`,

      // outro: reverse, fade-in (for tail fade-out), reverse back, format
      `[2:a]areverse,afade=t=in:d=${OUTRO_FADE_SEC},areverse,` +
        `aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=stereo[outro];`,

      // concat intro + main + outro, then dynamics + loudnorm
      `[intro][main][outro]concat=n=3:v=0:a=1,` +
        `acompressor=threshold=-18dB:ratio=2:attack=5:release=120,` +
        `loudnorm=I=-16:TP=-1.5:LRA=11:print_format=none[out]`,
    ].join("");

    const args = [
      "-y",
      "-i",
      introPath,
      "-i",
      mainPath,
      "-i",
      outroPath,
      "-filter_complex",
      filterComplex,
      "-map",
      "[out]",
      "-c:a",
      "libmp3lame",
      "-b:a",
      "128k",
      outputPath,
    ];

    info("🎵 podcastProcessor ffmpeg attempt", {
      sessionId,
      attempt,
      total,
    });

    const ff = spawn("ffmpeg", args);
    let stderr = "";

    ff.stderr.on("data", (data) => {
      const txt = data.toString();
      stderr += txt;
      if (txt.toLowerCase().includes("error")) {
        warn("⚠️ ffmpeg stderr (podcastProcessor)", {
          sessionId,
          attempt,
          chunk: txt,
        });
      }
    });

    ff.on("error", (err) => reject(err));

    ff.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg failed (code ${code}): ${stderr}`));
    });
  });
}

// ------------------------------------------------------------
// 🎧 podcastProcessor — Main Entry
// ------------------------------------------------------------
export async function podcastProcessor(sessionId, editedBuffer) {
  const label = `podcastProcessor:${sessionId}`;

  // If no intro/outro defined → return edited buffer unchanged.
  if (!PODCAST_INTRO_URL || !PODCAST_OUTRO_URL) {
    warn(
      "⚠️ PODCAST_INTRO_URL or PODCAST_OUTRO_URL missing — skipping mixdown",
      { sessionId }
    );
    return editedBuffer;
  }

  // Paths
  const introPath = path.join(TMP_DIR, `${sessionId}_intro.mp3`);
  const mainPath = path.join(TMP_DIR, `${sessionId}_main.mp3`);
  const outroPath = path.join(TMP_DIR, `${sessionId}_outro.mp3`);
  const finalPath = path.join(TMP_DIR, `${sessionId}_final.mp3`);

  try {
    // Write main (edited speech) locally
    await fs.promises.writeFile(mainPath, editedBuffer);

    // Download intro & outro locally (single attempt each;
    // if this fails, we bail early with edited buffer)
    await downloadToLocal(PODCAST_INTRO_URL, introPath, "intro");
    await downloadToLocal(PODCAST_OUTRO_URL, outroPath, "outro");

    let finalBuffer = null;
    let lastError = null;

    startKeepAlive(label, 15000);

    for (let attempt = 1; attempt <= MAX_PODCAST_RETRIES; attempt++) {
      try {
        // clear previous final file
        try {
          await fs.promises.unlink(finalPath);
        } catch {
          // ignore
        }

        await runPodcastMixdownOnce(
          sessionId,
          introPath,
          mainPath,
          outroPath,
          finalPath,
          attempt,
          MAX_PODCAST_RETRIES
        );

        finalBuffer = await fs.promises.readFile(finalPath);

        info("✅ podcastProcessor succeeded", {
          sessionId,
          bytes: finalBuffer.length,
        });

        break; // success
      } catch (err) {
        lastError = err;

        warn("⚠️ podcastProcessor ffmpeg attempt failed", {
          sessionId,
          attempt,
          maxAttempts: MAX_PODCAST_RETRIES,
          error: err.message,
        });

        if (attempt < MAX_PODCAST_RETRIES) {
          const delay =
            PODCAST_RETRY_DELAY_MS *
            Math.pow(PODCAST_RETRY_BACKOFF, attempt - 1);

          info("🔁 Retrying podcastProcessor", {
            sessionId,
            attempt,
            delayMs: delay,
          });

          await new Promise((res) => setTimeout(res, delay));
        }
      }
    }

    stopKeepAlive(label);

    // Cleanup temp final file (best-effort)
    try {
      await fs.promises.unlink(finalPath);
    } catch {
      // ignore
    }

    // If all attempts failed → return edited buffer
    if (!finalBuffer) {
      error("💥 podcastProcessor failed after all retries", {
        sessionId,
        error: lastError?.message,
      });
      return editedBuffer;
    }

    // --------------------------------------------------------
    // 📦 Safenet upload
    // --------------------------------------------------------
    if (EDITED_BUCKET && PUBLIC_EDITED_BASE) {
      try {
        const key = `${sessionId}_final.mp3`;

        // FIX: use the real bucket, not literal "edited"
        await putObject(EDITED_BUCKET, key, finalBuffer, "audio/mpeg");

        info("💾 podcastProcessor safenet upload OK", {
          sessionId,
          bucket: EDITED_BUCKET,
          key,
          url: `${PUBLIC_EDITED_BASE}/${encodeURIComponent(key)}`,
        });
      } catch (err) {
        warn("⚠️ podcastProcessor safenet upload failed", {
          sessionId,
          error: err.message,
        });
      }
    }

    return finalBuffer;
  } catch (err) {
    stopKeepAlive(label);
    error("💥 podcastProcessor crashed", {
      sessionId,
      error: err.message,
    });
    return editedBuffer;
  }
}

export default podcastProcessor;
