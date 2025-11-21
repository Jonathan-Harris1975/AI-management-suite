// ============================================================
// 🎵 Modular Podcast Processor — Final Production Version
// ============================================================
// Pipeline:
//   1. Download intro/outro
//   2. Fade intro (in) with simple fade
//   3. Fade outro (out) with simple fade
//   4. Concat intro + main + outro
//   5. Apply compression + loudnorm
//   6. Save final MP3
//   7. Upload final MP3 to R2 ("podcast")
//   8. Update metadata file in R2 ("meta")
//   9. Schedule delayed cleanup (2 minutes)
// ============================================================

import fs from "fs";
import path from "path";
import { spawn, spawnSync } from "child_process";
import { info, warn, error, debug } from "#logger.js";
import { startKeepAlive, stopKeepAlive } from "#shared/keepalive.js";
import { putObject } from "#shared/r2-client.js";

const TMP_DIR = "/tmp/podcast_master";

const PODCAST_INTRO_URL = process.env.PODCAST_INTRO_URL || "";
const PODCAST_OUTRO_URL = process.env.PODCAST_OUTRO_URL || "";
const MIN_INTRO_DURATION = Number(process.env.MIN_INTRO_DURATION || 3);
const MIN_OUTRO_DURATION = Number(process.env.MIN_OUTRO_DURATION || 3);

const INTRO_FADE_SEC = Math.max(0.1, MIN_INTRO_DURATION);
const OUTRO_FADE_SEC = Math.max(0.1, MIN_OUTRO_DURATION);
const CLEANUP_DELAY_MS = 2 * 60 * 1000; // 2-minute delay for cleanup

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

// Delayed cleanup function
function scheduleDelayedCleanup(sessionId) {
  setTimeout(async () => {
    try {
      const files = await fs.promises.readdir(TMP_DIR);
      const sessionFiles = files.filter((f) => f.includes(sessionId));
      
      if (sessionFiles.length > 0) {
        await Promise.allSettled(
          sessionFiles.map((f) => fs.promises.unlink(path.join(TMP_DIR, f)))
        );
        
        info("🧹 Delayed cleanup completed", {
          sessionId,
          files: sessionFiles.length,
          delay: "2 minutes"
        });
      }
    } catch (cleanupErr) {
      warn("⚠️ Delayed cleanup error", {
        sessionId,
        error: cleanupErr.message
      });
    }
  }, CLEANUP_DELAY_MS);
  
  info("⏰ Scheduled delayed cleanup", {
    sessionId,
    delayMs: CLEANUP_DELAY_MS,
    scheduledAt: new Date().toISOString()
  });
}

// Metadata helper
async function updateMetaFile(sessionId, finalBuffer, finalPath, podcastUrl) {
  const cleanId = sessionId;

  const metaKey = `podcast-meta/${cleanId}.json`;
  const metaUrl = `${process.env.R2_PUBLIC_BASE_URL_META}/${cleanId}.json`;

  let existing = {};

  try {
    const res = await fetch(metaUrl);
    if (res.ok) {
      existing = await res.json();
    }
  } catch {
    // meta may not exist yet
  }

  let duration = null;
  try {
    const probe = spawnSync(
      "ffprobe",
      [
        "-v",
        "error",
        "-show_entries",
        "format=duration",
        "-of",
        "default=noprint_wrappers=1:nokey=1",
        finalPath,
      ],
      { encoding: "utf8" }
    );
    if (probe.status === 0) {
      duration = parseFloat(probe.stdout.trim());
    }
  } catch {
    // leave duration null on error
  }

  const fileSize = finalBuffer.length;

  const baseDate =
    existing.pubDate ||
    existing.session?.date ||
    existing.createdAt ||
    new Date().toISOString();

  const pubDate = new Date(baseDate).toUTCString();

  const updated = {
    ...existing,
    sessionId: cleanId,
    artUrl: `${process.env.R2_PUBLIC_BASE_URL_ART}/${cleanId}.png`,
    transcriptUrl: `${process.env.R2_PUBLIC_BASE_URL_RAW_TEXT}/${cleanId}.txt`,
    podcastUrl,
    duration,
    fileSize,
    pubDate,
    updatedAt: new Date().toISOString(),
  };

  await putObject(
    "meta",
    metaKey,
    Buffer.from(JSON.stringify(updated, null, 2)),
    { contentType: "application/json" }
  );

  return { metaKey, metaUrl };
}

async function verifyAudioFile(filePath, label, sessionId) {
  try {
    const stats = await fs.promises.stat(filePath);
    if (stats.size === 0) throw new Error(`File is empty (0 bytes)`);

    // More lenient ffprobe command that handles problematic MP3 files better
    const probe = spawnSync(
      "ffprobe",
      [
        "-v", "error",
        "-skip_frame", "nokey", // Skip non-key frames to avoid seek issues
        "-select_streams", "a:0",
        "-show_entries", "format=duration:stream=codec_type",
        "-of", "json",
        filePath
      ],
      { encoding: "utf8", timeout: 15000 } // Increased timeout
    );

    // If the basic probe fails, try an even more lenient approach
    if (probe.status !== 0) {
      debug(`⚠️ First verification attempt failed for ${label}, trying fallback`, {
        sessionId,
        error: probe.stderr
      });

      // Fallback: Just check if it's an audio file and has some duration
      const fallbackProbe = spawnSync(
        "ffprobe",
        [
          "-v", "quiet",
          "-show_entries", "format=duration",
          "-of", "default=noprint_wrappers=1:nokey=1",
          filePath
        ],
        { encoding: "utf8", timeout: 10000 }
      );

      if (fallbackProbe.status === 0 && fallbackProbe.stdout.trim()) {
        const duration = parseFloat(fallbackProbe.stdout.trim());
        if (duration > 0) {
          debug(`✅ Fallback verification passed for ${label}`, {
            sessionId,
            filePath,
            size: stats.size,
            duration
          });
          return { streams: [{ duration }], format: { duration } };
        }
      }

      throw new Error(probe.stderr || "ffprobe failure");
    }

    const data = JSON.parse(probe.stdout);

    debug(`🎧 Verified audio: ${label}`, {
      sessionId,
      filePath,
      size: stats.size,
      ...data.streams?.[0],
    });

    return data;
  } catch (err) {
    // If verification fails but file exists and has reasonable size, log warning but continue
    if (label === "main") {
      const stats = await fs.promises.stat(filePath);
      if (stats.size > 1000) { // If file is >1KB, it's probably usable
        warn(`⚠️ Audio verification warning for ${label} (but proceeding)`, {
          sessionId,
          error: err.message,
          fileSize: stats.size
        });
        return { streams: [{}], format: {} }; // Return minimal valid structure
      }
    }
    
    throw new Error(
      `Audio verification failed for ${label}: ${err.message}`
    );
  }
}

function runFFmpeg(args, label, sessionId, timeoutMs = PODCAST_FFMPEG_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    const ff = spawn("ffmpeg", args);
    let stderr = "";
    let timeoutId = setTimeout(() => {
      warn(`⚠️ FFmpeg timeout: ${label}`, { sessionId });
      try {
        ff.kill("SIGKILL");
      } catch {}
      reject(new Error(`FFmpeg timed out`));
    }, timeoutMs);

    ff.stderr.on("data", (d) => {
      stderr += d.toString();
    });

    ff.on("error", (err) => {
      clearTimeout(timeoutId);
      reject(err);
    });

    ff.on("close", (code) => {
      clearTimeout(timeoutId);
      if (code === 0) return resolve();
      reject(new Error(`FFmpeg failed (${label}): ${stderr.slice(-500)}`));
    });
  });
}

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

      const file = fs.createWriteStream(targetPath);
      const reader = res.body.getReader();
      let bytes = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        bytes += value.length;
        file.write(value);
      }

      await new Promise((res) => file.end(res));

      if (bytes < 500) throw new Error("Downloaded file too small");

      await verifyAudioFile(targetPath, label, sessionId);

      return;
    } catch (err) {
      lastErr = err;
      warn(`⚠️ Download failed for ${label}`, {
        sessionId,
        attempt,
        error: err.message,
      });

      try {
        await fs.promises.unlink(targetPath);
      } catch {}

      if (attempt < retries) {
        const delay = 2000 * Math.pow(2, attempt - 1);
        await new Promise((res) => setTimeout(res, delay));
      }
    }
  }

  throw new Error(
    `Failed to download ${label}: ${lastErr?.message}`
  );
}

async function applyFades(sessionId, introPath, outroPath) {
  const introFaded = path.join(TMP_DIR, `${sessionId}_intro_faded.mp3`);
  const outroFaded = path.join(TMP_DIR, `${sessionId}_outro_faded.mp3`);

  await verifyAudioFile(introPath, "intro", sessionId);
  await verifyAudioFile(outroPath, "outro", sessionId);

  // SIMPLE FADE VERSION: Intro fade in
  const introFadeFilter = `afade=t=in:st=0:d=${INTRO_FADE_SEC}`;
  
  await runFFmpeg(
    ["-y", "-i", introPath, "-af", introFadeFilter, introFaded],
    "fade-intro",
    sessionId
  );

  // SIMPLE FADE VERSION: Outro fade out
  const outroFadeFilter = `afade=t=out:st=0:d=${OUTRO_FADE_SEC}`;
  
  await runFFmpeg(
    [
      "-y",
      "-i",
      outroPath,
      "-af",
      outroFadeFilter,
      outroFaded,
    ],
    "fade-outro",
    sessionId
  );

  info("🎚️ Applied simple fades", {
    sessionId,
    introFadeDuration: INTRO_FADE_SEC,
    outroFadeDuration: OUTRO_FADE_SEC
  });

  return { introFaded, outroFaded };
}

async function applyAudioEffects(sessionId, introFaded, mainPath, outroFaded, outputPath) {
  await verifyAudioFile(introFaded, "faded intro", sessionId);
  await verifyAudioFile(mainPath, "main", sessionId);
  await verifyAudioFile(outroFaded, "faded outro", sessionId);

  const filterComplex =
    "[0:a][1:a][2:a]concat=n=3:v=0:a=1," +
    "acompressor=threshold=-18dB:ratio=2:attack=5:release=120," +
    "loudnorm=I=-16:TP=-1.5:LRA=11:print_format=none[out]";

  await runFFmpeg(
    [
      "-y",
      "-i",
      introFaded,
      "-i",
      mainPath,
      "-i",
      outroFaded,
      "-filter_complex",
      filterComplex,
      "-map",
      "[out]",
      "-c:a",
      "libmp3lame",
      outputPath,
    ],
    "mixdown",
    sessionId
  );

  await verifyAudioFile(outputPath, "final output", sessionId);
}

async function runPodcastPipeline(
  sessionId,
  introPath,
  mainPath,
  outroPath,
  outputPath,
  attempt,
  total
) {
  try {
    await verifyAudioFile(mainPath, "main", sessionId);
  } catch (err) {
    // If main file verification fails but file exists and has reasonable size, continue anyway
    const stats = await fs.promises.stat(mainPath);
    if (stats.size > 1000) {
      warn(`⚠️ Main audio verification failed but file seems usable, continuing`, {
        sessionId,
        fileSize: stats.size,
        error: err.message
      });
    } else {
      throw err;
    }
  }

  const { introFaded, outroFaded } = await applyFades(
    sessionId,
    introPath,
    outroPath
  );

  await applyAudioEffects(
    sessionId,
    introFaded,
    mainPath,
    outroFaded,
    outputPath
  );
}

async function immediateCleanupTempFiles(sessionId) {
  try {
    const files = await fs.promises.readdir(TMP_DIR);
    const sessionFiles = files.filter((f) => f.includes(sessionId));

    // Keep final file for now, clean up intermediates
    const intermediateFiles = sessionFiles.filter(f => !f.includes('_final.mp3'));
    
    await Promise.allSettled(
      intermediateFiles.map((f) => fs.promises.unlink(path.join(TMP_DIR, f)))
    );

    info("🧹 Immediate cleanup completed", {
      sessionId,
      files: intermediateFiles.length,
    });
  } catch (e) {
    warn("⚠️ Immediate cleanup error", { sessionId, error: e.message });
  }
}

export async function podcastProcessor(sessionId, editedBuffer) {
  const keepAliveId = `podcastProcessor:${sessionId}`;

  if (!PODCAST_INTRO_URL || !PODCAST_OUTRO_URL) {
    warn("⚠️ Missing intro/outro URL", { sessionId });
    return editedBuffer;
  }

  if (!editedBuffer || editedBuffer.length === 0) {
    warn("⚠️ Empty editedBuffer", { sessionId });
    return editedBuffer;
  }

  // Add buffer size validation
  if (editedBuffer.length < 1000) {
    throw new Error(`Edited buffer too small: ${editedBuffer.length} bytes`);
  }

  const introPath = path.join(TMP_DIR, `${sessionId}_intro.mp3`);
  const mainPath = path.join(TMP_DIR, `${sessionId}_main.mp3`);
  const outroPath = path.join(TMP_DIR, `${sessionId}_outro.mp3`);
  const finalPath = path.join(TMP_DIR, `${sessionId}_final.mp3`);

  try {
    await fs.promises.writeFile(mainPath, editedBuffer);

    // Verify the file was written correctly
    const writtenStats = await fs.promises.stat(mainPath);
    if (writtenStats.size !== editedBuffer.length) {
      throw new Error(`File write incomplete: expected ${editedBuffer.length} bytes, got ${writtenStats.size}`);
    }

    startKeepAlive(keepAliveId, 15000);

    await downloadToLocal(PODCAST_INTRO_URL, introPath, "intro", sessionId);
    await downloadToLocal(PODCAST_OUTRO_URL, outroPath, "outro", sessionId);

    let finalBuffer = null;
    let lastError = null;

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

        const buf = await fs.promises.readFile(finalPath);
        if (buf.length === 0) throw new Error("Empty output");

        finalBuffer = buf;
        break;
      } catch (err) {
        lastError = err;

        warn(`⚠️ Attempt ${attempt} failed`, {
          sessionId,
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

    if (!finalBuffer)
      throw new Error(
        `Pipeline failed after ${MAX_PODCAST_RETRIES} attempts: ${lastError?.message}`
      );

    // Do immediate cleanup of intermediate files
    await immediateCleanupTempFiles(sessionId);

    const podcastKey = `${sessionId}_podcast.mp3`;
    const podcastUrl = `${process.env.R2_PUBLIC_BASE_URL_PODCAST}/${podcastKey}`;

    try {
      await putObject("podcast", podcastKey, finalBuffer, {
        contentType: "audio/mpeg",
      });

      info("📡 Uploaded final podcast", {
        sessionId,
        podcastKey,
        podcastUrl,
        size: finalBuffer.length,
      });
    } catch (uploadErr) {
      error("❌ Podcast upload failed", {
        sessionId,
        error: uploadErr.message,
      });
      return finalBuffer;
    }

    try {
      const { metaKey, metaUrl } = await updateMetaFile(
        sessionId,
        finalBuffer,
        finalPath,
        podcastUrl
      );

      info("📘 Metadata updated", {
        sessionId,
        metaKey,
        metaUrl,
      });
    } catch (metaErr) {
      error("❌ Failed to update metadata", {
        sessionId,
        error: metaErr.message,
      });
    }

    // Schedule delayed cleanup for final file
    scheduleDelayedCleanup(sessionId);

    return {
      buffer: finalBuffer,
      key: podcastKey,
      url: podcastUrl,
    };
  } catch (err) {
    stopKeepAlive(keepAliveId);
    await immediateCleanupTempFiles(sessionId);

    error("❌ podcastProcessor failed", {
      sessionId,
      error: err.message,
      stack: err.stack,
    });

    throw err;
  }
    }
