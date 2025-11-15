// ============================================================
// 🎵 Podcast Processor — Intro/Outro Mixdown & Final Mastering
// ============================================================
//
// Signature:
//   const finalAudio = await podcastProcessor(sessionId, editedBuffer);
//
// Processing:
//   • Download intro & outro to /tmp/podcast_master
//   • Use editedBuffer as main
//   • Normalize all three inputs to 48kHz mono s16
//   • Intro fade-in, outro tail-fade via reverse trick
//   • Concat intro + main + outro
//   • Final acompressor + loudnorm
//
// Safety:
//   • ffmpeg uses -xerror → hard fail on decode errors
//   • Output must be >= 10 KB
//   • ffmpeg timeout guard (no infinite hang)
//   • On total failure, returns editedBuffer unchanged
// ============================================================

import fs from "fs";
import path from "path";
import { spawn } from "child_process";
import { info, warn, error } from "#logger.js";
import { startKeepAlive, stopKeepAlive } from "#shared/keepalive.js";
import { putObject } from "#shared/r2-client.js";

const TMP_DIR = "/tmp/podcast_master";
const MIN_VALID_BYTES = 10 * 1024; // 10 KB

const PODCAST_INTRO_URL = process.env.PODCAST_INTRO_URL || "";
const PODCAST_OUTRO_URL = process.env.PODCAST_OUTRO_URL || "";

const MIN_INTRO_DURATION = Number(
  process.env.MIN_INTRO_DURATION || 3
);
const MIN_OUTRO_DURATION = Number(
  process.env.MIN_OUTRO_DURATION || 3
);

const INTRO_FADE_SEC = Math.max(0.1, MIN_INTRO_DURATION);
const OUTRO_FADE_SEC = Math.max(0.1, MIN_OUTRO_DURATION);

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

// Kill ffmpeg if it runs too long (ms)
const PODCAST_FFMPEG_TIMEOUT_MS = Number(
  process.env.PODCAST_FFMPEG_TIMEOUT_MS || 5 * 60 * 1000
); // default 5 min

const EDITED_BUCKET = process.env.R2_BUCKET_EDITED_AUDIO || "";
const PUBLIC_EDITED_BASE =
  process.env.R2_PUBLIC_BASE_URL_EDITED_AUDIO || "";

if (!fs.existsSync(TMP_DIR)) {
  fs.mkdirSync(TMP_DIR, { recursive: true });
}

// ------------------------------------------------------------
// 📥 Download helper (intro/outro)
// ------------------------------------------------------------
async function downloadToLocal(url, targetPath, label) {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(
      `Failed to download ${label}: HTTP ${res.status}`
    );
  }

  const buf = Buffer.from(await res.arrayBuffer());

  if (buf.length < MIN_VALID_BYTES) {
    throw new Error(
      `${label} MP3 too small or invalid (bytes=${buf.length})`
    );
  }

  await fs.promises.writeFile(targetPath, buf);

  info(`⬇️ Downloaded ${label}`, {
    bytes: buf.length,
    targetPath,
  });

  return buf;
}

// ------------------------------------------------------------
// 🧪 ffmpeg mixdown — one attempt
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
    // All inputs → 48kHz mono s16, then concat, then compressor + loudnorm
    const filterComplex = `
      [0:a]aresample=48000,pan=mono|c0=c0,
           aformat=sample_fmts=s16:sample_rates=48000:channel_layouts=mono,
           afade=t=in:d=${INTRO_FADE_SEC}[intro];
      [1:a]aresample=48000,pan=mono|c0=c0,
           aformat=sample_fmts=s16:sample_rates=48000:channel_layouts=mono[main];
      [2:a]aresample=48000,pan=mono|c0=c0,
           aformat=sample_fmts=s16:sample_rates=48000:channel_layouts=mono,
           areverse,afade=t=in:d=${OUTRO_FADE_SEC},areverse[outro];
      [intro][main][outro]concat=n=3:v=0:a=1,
        acompressor=threshold=-18dB:ratio=2:attack=5:release=120,
        loudnorm=I=-16:TP=-1.5:LRA=11:print_format=none[out]
    `.replace(/\s+/g, " ");

    const args = [
      "-y",
      "-xerror", // 🔥 hard fail on decode errors
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
    let timeoutId = null;
    let settled = false;

    // ⏱️ Timeout guard
    if (PODCAST_FFMPEG_TIMEOUT_MS > 0) {
      timeoutId = setTimeout(() => {
        if (settled) return;
        settled = true;
        warn("⚠️ podcastProcessor ffmpeg timed out, killing process", {
          sessionId,
          attempt,
          timeoutMs: PODCAST_FFMPEG_TIMEOUT_MS,
        });
        try {
          ff.kill("SIGKILL");
        } catch {
          // ignore
        }
        reject(
          new Error(
            `ffmpeg timed out after ${PODCAST_FFMPEG_TIMEOUT_MS} ms`
          )
        );
      }, PODCAST_FFMPEG_TIMEOUT_MS);
    }

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

    ff.on("error", (err) => {
      if (settled) return;
      settled = true;
      if (timeoutId) clearTimeout(timeoutId);
      reject(err);
    });

    ff.on("close", (code) => {
      if (settled) return;
      settled = true;
      if (timeoutId) clearTimeout(timeoutId);

      if (code === 0) {
        resolve();
      } else {
        reject(
          new Error(
            `ffmpeg failed (code ${code}): ${stderr}`
          )
        );
      }
    });
  });
}

// ------------------------------------------------------------
// 🎧 podcastProcessor — Main
// ------------------------------------------------------------
export async function podcastProcessor(
  sessionId,
  editedBuffer
) {
  const label = `podcastProcessor:${sessionId}`;

  if (!PODCAST_INTRO_URL || !PODCAST_OUTRO_URL) {
    warn(
      "⚠️ PODCAST_INTRO_URL or PODCAST_OUTRO_URL missing — skipping mixdown",
      { sessionId }
    );
    return editedBuffer;
  }

  const introPath = path.join(TMP_DIR, `${sessionId}_intro.mp3`);
  const mainPath = path.join(TMP_DIR, `${sessionId}_main.mp3`);
  const outroPath = path.join(TMP_DIR, `${sessionId}_outro.mp3`);
  const finalPath = path.join(TMP_DIR, `${sessionId}_final.mp3`);

  try {
    await fs.promises.writeFile(mainPath, editedBuffer);

    // Download intro & outro
    await downloadToLocal(
      PODCAST_INTRO_URL,
      introPath,
      "intro"
    );
    await downloadToLocal(
      PODCAST_OUTRO_URL,
      outroPath,
      "outro"
    );

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

        const candidate = await fs.promises.readFile(
          finalPath
        );

        if (candidate.length < MIN_VALID_BYTES) {
          throw new Error(
            `Final MP3 too small or invalid (bytes=${candidate.length})`
          );
        }

        finalBuffer = candidate;

        info("✅ podcastProcessor succeeded", {
          sessionId,
          bytes: finalBuffer.length,
        });

        break;
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

          await new Promise((res) =>
            setTimeout(res, delay)
          );
        }
      }
    }

    stopKeepAlive(label);

    // Cleanup final file (best-effort)
    try {
      await fs.promises.unlink(finalPath);
    } catch {
      // ignore
    }

    // All attempts failed → return editedBuffer unchanged
    if (!finalBuffer) {
      error("💥 podcastProcessor failed after all retries", {
        sessionId,
        error: lastError?.message,
      });
      return editedBuffer;
    }

    // 📦 Safenet upload
    if (EDITED_BUCKET && PUBLIC_EDITED_BASE) {
      try {
        const key = `${sessionId}_final.mp3`;

        await putObject(
          EDITED_BUCKET,
          key,
          finalBuffer,
          "audio/mpeg"
        );

        info("💾 podcastProcessor safenet upload OK", {
          sessionId,
          bucket: EDITED_BUCKET,
          key,
          url: `${PUBLIC_EDITED_BASE}/${encodeURIComponent(
            key
          )}`,
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
