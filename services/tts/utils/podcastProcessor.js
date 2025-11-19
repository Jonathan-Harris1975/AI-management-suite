// ============================================================
// 🎵 Modular Podcast Processor — Final Production Version
// ============================================================
// Pipeline:
//   1. Download intro/outro
//   2. Fade intro (in)
//   3. Fade outro (out)
//   4. Concat intro + main + outro
//   5. Apply compression + loudnorm
//   6. Save final MP3
//   7. Upload final MP3 to R2 ("podcast")
// ============================================================

import fs from "fs";
import path from "path";
import { spawn, spawnSync } from "child_process";
import { info, warn, error, debug } from "#logger.js";
import { startKeepAlive, stopKeepAlive } from "#shared/keepalive.js";
import { putObject } from "#shared/r2-client.js";

// ============================================================
// Config
// ============================================================
const TMP_DIR = "/tmp/podcast_master";

const PODCAST_INTRO_URL = process.env.PODCAST_INTRO_URL || "";
const PODCAST_OUTRO_URL = process.env.PODCAST_OUTRO_URL || "";

const MIN_INTRO_DURATION = Number(process.env.MIN_INTRO_DURATION || 3);
const MIN_OUTRO_DURATION = Number(process.env.MIN_OUTRO_DURATION || 3);

const INTRO_FADE_SEC = Math.max(0.1, MIN_INTRO_DURATION);
const OUTRO_FADE_SEC = Math.max(0.1, MIN_OUTRO_DURATION);

const MAX_PODCAST_RETRIES = Number(
  process.env.MAX_PODCAST_RETRIES || process.env.MAX_CHUNK_RETRIES || 3
);

const PODCAST_RETRY_DELAY_MS = Number(
  process.env.PODCAST_RETRY_DELAY_MS || process.env.RETRY_DELAY_MS || 2000
);

const PODCAST_RETRY_BACKOFF = Number(process.env.RETRY_BACKOFF_MULTIPLIER || 2);

const PODCAST_FFMPEG_TIMEOUT_MS = Number(
  process.env.PODCAST_FFMPEG_TIMEOUT_MS || 5 * 60 * 1000
);

if (!fs.existsSync(TMP_DIR)) {
  fs.mkdirSync(TMP_DIR, { recursive: true });
}

// ============================================================
// Utility: Verify audio file
// ============================================================
async function verifyAudioFile(filePath, label, sessionId) {
  try {
    const stats = await fs.promises.stat(filePath);
    if (stats.size === 0) throw new Error(`File is empty (0 bytes)`);

    const result = spawnSync(
      "ffprobe",
      [
        "-v",
        "error",
        "-select_streams",
        "a:0",
        "-show_entries",
        "stream=duration,codec_name,sample_rate,channels,bit_rate",
        "-of",
        "json",
        filePath,
      ],
      { encoding: "utf8", timeout: 10000 }
    );

    if (result.status !== 0)
      throw new Error(result.stderr || "ffprobe failure");

    const probeInfo = JSON.parse(result.stdout);
    if (!probeInfo.streams || probeInfo.streams.length === 0)
      throw new Error("No audio streams detected");

    const s = probeInfo.streams[0];

    debug(`🎧 Verified audio: ${label}`, {
      sessionId,
      filePath,
      size: stats.size,
      duration: s.duration,
      samplerate: s.sample_rate,
      channels: s.channels,
      codec: s.codec_name,
      bitrate: s.bit_rate,
    });

    return probeInfo;
  } catch (err) {
    throw new Error(
      `Audio verification failed for ${label}: ${err.message}`
    );
  }
}

// ============================================================
// Utility: ffmpeg wrapper with timeout
// ============================================================
function runFFmpeg(args, label, sessionId, timeoutMs = PODCAST_FFMPEG_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    const ff = spawn("ffmpeg", args);
    let stderr = "";
    let settled = false;
    let timeoutId = null;

    if (timeoutMs > 0) {
      timeoutId = setTimeout(() => {
        if (settled) return;
        settled = true;
        warn(`⚠️ FFmpeg timeout: ${label}`, { sessionId, timeoutMs });
        try {
          ff.kill("SIGKILL");
        } catch {}
        reject(new Error(`FFmpeg timed out after ${timeoutMs}ms`));
      }, timeoutMs);
    }

    ff.stderr.on("data", (d) => {
      const txt = d.toString();
      stderr += txt;

      if (txt.toLowerCase().includes("error")) {
        warn(`⚠️ ffmpeg stderr (${label})`, { sessionId, chunk: txt });
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

      if (code === 0) return resolve();

      reject(
        new Error(
          `FFmpeg failed (${label}) → exit ${code}: ${stderr.slice(-500)}`
        )
      );
    });
  });
}

// ============================================================
// Utility: download intro/outro
// ============================================================
async function downloadToLocal(url, targetPath, label, sessionId, retries = 3) {
  let lastErr = null;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      debug(`⬇️ Downloading ${label} (${attempt}/${retries})`, {
        sessionId,
        url,
      });

      const res = await fetch(url, {
        signal: AbortSignal.timeout(60000),
      });

      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);

      const fileStream = fs.createWriteStream(targetPath);

      const reader = res.body.getReader();
      let bytes = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        bytes += value.length;
        fileStream.write(value);
      }

      await new Promise((res) => fileStream.end(res));

      if (bytes < 500) throw new Error(`Too small: ${bytes} bytes`);

      debug(`⬇️ Downloaded ${label}`, { sessionId, bytes });

      await verifyAudioFile(targetPath, label, sessionId);
      return;
    } catch (err) {
      lastErr = err;
      warn(`⚠️ Download failed (${label})`, {
        sessionId,
        attempt,
        error: err.message,
      });

      try {
        await fs.promises.unlink(targetPath);
      } catch {}

      if (attempt < retries)
        await new Promise((res) =>
          setTimeout(res, 2000 * Math.pow(2, attempt - 1))
        );
    }
  }

  throw new Error(
    `Failed to download ${label}: ${lastErr?.message}`
  );
}

// ============================================================
// STEP 1 — Fade intro & outro
// ============================================================
async function applyFades(sessionId, introPath, outroPath) {
  info("🎛️ STEP 1: Applying fade in/out", { sessionId });

  const introFadedPath = path.join(TMP_DIR, `${sessionId}_intro_faded.mp3`);
  const outroFadedPath = path.join(TMP_DIR, `${sessionId}_outro_faded.mp3`);

  await verifyAudioFile(introPath, "intro", sessionId);
  await verifyAudioFile(outroPath, "outro", sessionId);

  // Fade-in intro
  await runFFmpeg(
    [
      "-y",
      "-i",
      introPath,
      "-af",
      `afade=t=in:d=${INTRO_FADE_SEC}`,
      "-c:a",
      "libmp3lame",
      introFadedPath,
    ],
    "fade-intro",
    sessionId
  );

  // Fade-out outro
  await runFFmpeg(
    [
      "-y",
      "-i",
      outroPath,
      "-af",
      `areverse,afade=t=in:d=${OUTRO_FADE_SEC},areverse`,
      "-c:a",
      "libmp3lame",
      outroFadedPath,
    ],
    "fade-outro",
    sessionId
  );

  return { introFadedPath, outroFadedPath };
}

// ============================================================
// STEP 2 — Concat + compression + loudnorm
// ============================================================
async function applyAudioEffects(
  sessionId,
  introFadedPath,
  mainPath,
  outroFadedPath,
  outputPath
) {
  info("🎛️ STEP 2: Audio mixing", { sessionId });

  await verifyAudioFile(introFadedPath, "faded intro", sessionId);
  await verifyAudioFile(mainPath, "main audio", sessionId);
  await verifyAudioFile(outroFadedPath, "faded outro", sessionId);

  const filterComplex = `
    [0:a][1:a][2:a]concat=n=3:v=0:a=1,
    acompressor=threshold=-18dB:ratio=2:attack=5:release=120,
    loudnorm=I=-16:TP=-1.5:LRA=11:print_format=none[out]
  `.replace(/\s+/g, " ");

  await runFFmpeg(
    [
      "-y",
      "-i",
      introFadedPath,
      "-i",
      mainPath,
      "-i",
      outroFadedPath,
      "-filter_complex",
      filterComplex,
      "-map",
      "[out]",
      "-c:a",
      "libmp3lame",
      outputPath,
    ],
    "concat/mixdown",
    sessionId
  );

  await verifyAudioFile(outputPath, "final output", sessionId);
}

// ============================================================
// Pipeline Orchestrator
// ============================================================
async function runPodcastPipeline(
  sessionId,
  introPath,
  mainPath,
  outroPath,
  outputPath,
  attempt,
  total
) {
  info(`🎵 Running podcast pipeline (${attempt}/${total})`, { sessionId });

  await verifyAudioFile(mainPath, "main", sessionId);

  const { introFadedPath, outroFadedPath } = await applyFades(
    sessionId,
    introPath,
    outroPath
  );

  await applyAudioEffects(
    sessionId,
    introFadedPath,
    mainPath,
    outroFadedPath,
    outputPath
  );
}

// ============================================================
// Cleanup
// ============================================================
async function cleanupTempFiles(sessionId) {
  try {
    const files = await fs.promises.readdir(TMP_DIR);
    const sessionFiles = files.filter((f) => f.includes(sessionId));

    await Promise.allSettled(
      sessionFiles.map((f) =>
        fs.promises.unlink(path.join(TMP_DIR, f))
      )
    );

    info("🧹 Temporary files removed", {
      sessionId,
      count: sessionFiles.length,
    });
  } catch (e) {
    warn("⚠️ Cleanup error", { sessionId, error: e.message });
  }
}

// ============================================================
// MAIN: podcastProcessor
// ============================================================
export async function podcastProcessor(sessionId, editedBuffer) {
  const keepAliveId = `podcastProcessor:${sessionId}`;

  if (!PODCAST_INTRO_URL || !PODCAST_OUTRO_URL) {
    warn("⚠️ Missing intro/outro URL — skipping mixdown", { sessionId });
    return editedBuffer;
  }

  if (!editedBuffer || editedBuffer.length === 0) {
    warn("⚠️ Empty editedBuffer — skipping mixdown", { sessionId });
    return editedBuffer;
  }

  const introPath = path.join(TMP_DIR, `${sessionId}_intro.mp3`);
  const mainPath = path.join(TMP_DIR, `${sessionId}_main.mp3`);
  const outroPath = path.join(TMP_DIR, `${sessionId}_outro.mp3`);
  const finalPath = path.join(TMP_DIR, `${sessionId}_final.mp3`);

  try {
    // Write main audio
    await fs.promises.writeFile(mainPath, editedBuffer);

    startKeepAlive(keepAliveId, 15000);

    // Download intro & outro
    await downloadToLocal(PODCAST_INTRO_URL, introPath, "intro", sessionId);
    await downloadToLocal(PODCAST_OUTRO_URL, outroPath, "outro", sessionId);

    let finalBuffer = null;
    let lastError = null;

    // Retry loop
    for (let attempt = 1; attempt <= MAX_PODCAST_RETRIES; attempt++) {
      try {
        try {
          await fs.promises.unlink(finalPath);
        } catch {}

        await runPodcastPipeline(
          sessionId,
          introPath,
          mainPath,
          outroPath,
          finalPath,
          attempt,
          MAX_PODCAST_RETRIES
        );

        const candidate = await fs.promises.readFile(finalPath);

        if (candidate.length === 0) throw new Error("Final MP3 is empty");

        finalBuffer = candidate;

        info("🎉 Podcast pipeline succeeded", {
          sessionId,
          size: finalBuffer.length,
        });

        break;
      } catch (err) {
        lastError = err;

        warn("⚠️ Pipeline attempt failed", {
          sessionId,
          attempt,
          error: err.message,
        });

        if (attempt < MAX_PODCAST_RETRIES) {
          const delay =
            PODCAST_RETRY_DELAY_MS *
            Math.pow(PODCAST_RETRY_BACKOFF, attempt - 1);

          await new Promise((res) => setTimeout(res, delay));
        }
      }
    }

    stopKeepAlive(keepAliveId);

    if (!finalBuffer) {
      throw new Error(
        `Pipeline failed after ${MAX_PODCAST_RETRIES} attempts: ${lastError?.message}`
      );
    }

    await cleanupTempFiles(sessionId);

    // ------------------------------------------------------------
    // 📤 Upload FINAL MP3 to R2 bucket: "podcast"
    // ------------------------------------------------------------
    const key = `${sessionId}_podcast.mp3`;

    try {
      await putObject("podcast", key, finalBuffer, {
        contentType: "audio/mpeg",
      });

      const publicUrl = `${process.env.R2_PUBLIC_BASE_URL_PODCAST}/${key}`;

      info("📡 Uploaded final podcast MP3", {
        sessionId,
        key,
        url: publicUrl,
        size: finalBuffer.length,
      });

      return {
        buffer: finalBuffer,
        key,
        url: publicUrl,
      };
    } catch (uploadErr) {
      error("❌ Upload to R2 failed", {
        sessionId,
        error: uploadErr.message,
      });

      return finalBuffer;
    }
  } catch (err) {
    stopKeepAlive(keepAliveId);
    await cleanupTempFiles(sessionId);

    error("❌ podcastProcessor failed", {
      sessionId,
      error: err.message,
      stack: err.stack,
    });

    throw err;
  }
      }
