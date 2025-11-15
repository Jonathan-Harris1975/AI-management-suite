// ============================================================
// 🎵 Podcast Processor — Stable Mixdown & Final Mastering
// ============================================================
//
// Fixes:
// • ffmpeg hang fixed by normalizing ALL sources to:
//      - 48kHz
//      - mono
//      - s16
// • Safe concat guaranteed on all Linux ffmpeg builds
// • No more infinite running podcastProcessor
//
// ============================================================

import fs from "fs";
import path from "path";
import { spawn } from "child_process";
import { info, warn, error } from "#logger.js";
import { startKeepAlive, stopKeepAlive } from "#shared/keepalive.js";
import { putObject } from "#shared/r2-client.js";

const TMP_DIR = "/tmp/podcast_master";

const PODCAST_INTRO_URL = process.env.PODCAST_INTRO_URL || "";
const PODCAST_OUTRO_URL = process.env.PODCAST_OUTRO_URL || "";

const MIN_INTRO_DURATION = Number(process.env.MIN_INTRO_DURATION || 3);
const MIN_OUTRO_DURATION = Number(process.env.MIN_OUTRO_DURATION || 3);

const INTRO_FADE_SEC = Math.max(0.1, MIN_INTRO_DURATION);
const OUTRO_FADE_SEC = Math.max(0.1, MIN_OUTRO_DURATION);

const MAX_PODCAST_RETRIES = Number(process.env.MAX_PODCAST_RETRIES || 3);
const PODCAST_RETRY_DELAY_MS = Number(process.env.PODCAST_RETRY_DELAY_MS || 2000);
const PODCAST_RETRY_BACKOFF = Number(process.env.RETRY_BACKOFF_MULTIPLIER || 2);

const EDITED_BUCKET = process.env.R2_BUCKET_EDITED_AUDIO || "";
const PUBLIC_EDITED_BASE = process.env.R2_PUBLIC_BASE_URL_EDITED_AUDIO || "";

if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR, { recursive: true });

// ------------------------------------------------------------
// Download intro/outro locally
// ------------------------------------------------------------
async function downloadToLocal(url, targetPath, label) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to download ${label}: HTTP ${res.status}`);

  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 1000) throw new Error(`${label} MP3 too small or invalid`);

  await fs.promises.writeFile(targetPath, buf);

  info(`⬇️ Downloaded ${label}`, { bytes: buf.length, targetPath });

  return buf;
}

// ------------------------------------------------------------
// ffmpeg mixdown — one run
// ------------------------------------------------------------
function runPodcastMixdownOnce(sessionId, introPath, mainPath, outroPath, outputPath, attempt) {
  return new Promise((resolve, reject) => {
    // 🔥 CRITICAL FIX: normalize all three inputs safely
    const filterComplex = `
      [0:a]aresample=48000,pan=mono|c0=c0,aformat=sample_fmts=s16:sample_rates=48000:channel_layouts=mono,afade=t=in:d=${INTRO_FADE_SEC}[intro];
      [1:a]aresample=48000,pan=mono|c0=c0,aformat=sample_fmts=s16:sample_rates=48000:channel_layouts=mono[main];
      [2:a]aresample=48000,pan=mono|c0=c0,aformat=sample_fmts=s16:sample_rates=48000:channel_layouts=mono,areverse,afade=t=in:d=${OUTRO_FADE_SEC},areverse[outro];
      [intro][main][outro]concat=n=3:v=0:a=1,
        acompressor=threshold=-18dB:ratio=2:attack=5:release=120,
        loudnorm=I=-16:TP=-1.5:LRA=11:print_format=none[out]
    `.replace(/\s+/g, " ");

    const args = [
      "-y",
      "-i", introPath,
      "-i", mainPath,
      "-i", outroPath,
      "-filter_complex", filterComplex,
      "-map", "[out]",
      "-c:a", "libmp3lame",
      "-b:a", "128k",
      outputPath
    ];

    info("🎵 podcastProcessor ffmpeg attempt", { sessionId, attempt });

    const ff = spawn("ffmpeg", args);
    let stderr = "";

    ff.stderr.on("data", (d) => {
      const t = d.toString();
      stderr += t;
      if (t.toLowerCase().includes("error"))
        warn("⚠️ ffmpeg stderr (podcastProcessor)", { sessionId, attempt, stderr: t });
    });

    ff.on("error", reject);

    ff.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg failed (code ${code}): ${stderr}`));
    });
  });
}

// ------------------------------------------------------------
// 🎧 podcastProcessor main
// ------------------------------------------------------------
export async function podcastProcessor(sessionId, editedBuffer) {
  const label = `podcastProcessor:${sessionId}`;

  if (!PODCAST_INTRO_URL || !PODCAST_OUTRO_URL) {
    warn("⚠️ Missing intro or outro URL — skipping mixdown", { sessionId });
    return editedBuffer;
  }

  const introPath = path.join(TMP_DIR, `${sessionId}_intro.mp3`);
  const mainPath = path.join(TMP_DIR, `${sessionId}_main.mp3`);
  const outroPath = path.join(TMP_DIR, `${sessionId}_outro.mp3`);
  const finalPath = path.join(TMP_DIR, `${sessionId}_final.mp3`);

  try {
    await fs.promises.writeFile(mainPath, editedBuffer);
    await downloadToLocal(PODCAST_INTRO_URL, introPath, "intro");
    await downloadToLocal(PODCAST_OUTRO_URL, outroPath, "outro");

    let finalBuffer = null;
    let lastError = null;

    startKeepAlive(label, 15000);

    for (let attempt = 1; attempt <= MAX_PODCAST_RETRIES; attempt++) {
      try {
        try { await fs.promises.unlink(finalPath); } catch {}

        await runPodcastMixdownOnce(
          sessionId,
          introPath,
          mainPath,
          outroPath,
          finalPath,
          attempt
        );

        finalBuffer = await fs.promises.readFile(finalPath);

        info("✅ podcastProcessor succeeded", {
          sessionId,
          bytes: finalBuffer.length,
        });

        break;
      } catch (err) {
        lastError = err;
        warn("⚠️ podcastProcessor attempt failed", {
          sessionId,
          attempt,
          error: err.message
        });

        if (attempt < MAX_PODCAST_RETRIES) {
          const delay = PODCAST_RETRY_DELAY_MS * Math.pow(PODCAST_RETRY_BACKOFF, attempt - 1);
          info("🔁 Retrying podcastProcessor", { sessionId, attempt, delayMs: delay });
          await new Promise((r) => setTimeout(r, delay));
        }
      }
    }

    stopKeepAlive(label);

    if (!finalBuffer) {
      error("💥 podcastProcessor failed after all retries", {
        sessionId,
        error: lastError?.message,
      });
      return editedBuffer;
    }

    // Upload final
    if (EDITED_BUCKET && PUBLIC_EDITED_BASE) {
      const key = `${sessionId}_final.mp3`;
      await putObject(EDITED_BUCKET, key, finalBuffer, "audio/mpeg");
      info("💾 podcastProcessor safenet upload OK", {
        sessionId,
        key,
        url: `${PUBLIC_EDITED_BASE}/${encodeURIComponent(key)}`
      });
    }

    return finalBuffer;

  } catch (err) {
    stopKeepAlive(label);
    error("💥 podcastProcessor crashed", { sessionId, error: err.message });
    return editedBuffer;
  }
}

export default podcastProcessor;
