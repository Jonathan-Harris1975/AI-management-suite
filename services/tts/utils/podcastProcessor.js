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

// Audio validation constants for main section (20-80 minute podcasts)
const MIN_EXPECTED_DURATION = 18 * 60; // 18 minutes in seconds (buffer for 20 min)
const MAX_EXPECTED_DURATION = 98 * 60; // 98 minutes in seconds (buffer for 80 min + padding)
const MIN_FILE_SIZE = 100 * 1024; // 100KB minimum file size

if (!fs.existsSync(TMP_DIR)) {
  fs.mkdirSync(TMP_DIR, { recursive: true });
}

// FIX #1: Properly handle async operations in setTimeout
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

// FIX #2: Add error handling for fetch and validate response type
async function updateMetaFile(sessionId, finalBuffer, finalPath, podcastUrl) {
  const cleanId = sessionId;
  const metaKey = `podcast-meta/${cleanId}.json`;
  const metaUrl = `${process.env.R2_PUBLIC_BASE_URL_META}/${cleanId}.json`;

  let existing = {};

  try {
    const res = await fetch(metaUrl, { signal: AbortSignal.timeout(10000) });
    if (res.ok) {
      const contentType = res.headers.get("content-type");
      if (contentType?.includes("application/json")) {
        existing = await res.json();
      }
    }
  } catch (err) {
    debug("ℹ️ Meta file not found or fetch failed", { sessionId, error: err.message });
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
      { encoding: "utf8", timeout: 15000 }
    );
    if (probe.status === 0 && probe.stdout) {
      duration = parseFloat(probe.stdout.trim());
      if (isNaN(duration)) duration = null;
    }
  } catch (err) {
    debug("ℹ️ ffprobe error", { sessionId, error: err.message });
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

    if (label === "main") {
      if (stats.size < MIN_FILE_SIZE) {
        throw new Error(`Main file too small: ${stats.size} bytes (min: ${MIN_FILE_SIZE})`);
      }

      debug(`✅ Main audio basic verification passed`, {
        sessionId,
        filePath,
        size: stats.size,
        label
      });

      return { streams: [{}], format: { duration: null } };
    }

    // Standard verification for intro/outro files
    const probe = spawnSync(
      "ffprobe",
      [
        "-v", "error",
        "-skip_frame", "nokey",
        "-select_streams", "a:0",
        "-show_entries", "format=duration:stream=codec_type",
        "-of", "json",
        filePath
      ],
      { encoding: "utf8", timeout: 15000 }
    );

    if (probe.status !== 0) {
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

      if (fallbackProbe.status === 0 && fallbackProbe.stdout?.trim()) {
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

    let data;
    try {
      data = JSON.parse(probe.stdout);
    } catch (parseErr) {
      throw new Error(`Failed to parse ffprobe JSON: ${parseErr.message}`);
    }

    debug(`🎧 Verified audio: ${label}`, {
      sessionId,
      filePath,
      size: stats.size,
      ...data.streams?.[0],
    });

    return data;
  } catch (err) {
    if (label === "main") {
      try {
        const stats = await fs.promises.stat(filePath);
        if (stats.size >= MIN_FILE_SIZE) {
          warn(`⚠️ Main audio verification failed but file seems usable, continuing`, {
            sessionId,
            fileSize: stats.size,
            error: err.message,
            minRequired: MIN_FILE_SIZE
          });
          return { streams: [{}], format: {} };
        }
      } catch (statErr) {
        throw new Error(`Could not stat file: ${statErr.message}`);
      }
    }
    
    throw new Error(
      `Audio verification failed for ${label}: ${err.message}`
    );
  }
}

// FIX #3: Properly handle signal termination and child process cleanup
function runFFmpeg(args, label, sessionId, timeoutMs = PODCAST_FFMPEG_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    const ff = spawn("ffmpeg", args);
    let stderr = "";
    let isResolved = false;

    const timeoutId = setTimeout(() => {
      if (isResolved) return;
      warn(`⚠️ FFmpeg timeout: ${label}`, { sessionId });
      try {
        ff.kill("SIGKILL");
      } catch (killErr) {
        debug("Error killing ffmpeg process", { error: killErr.message });
      }
      isResolved = true;
      reject(new Error(`FFmpeg timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    ff.stderr.on("data", (d) => {
      stderr += d.toString();
    });

    ff.on("error", (err) => {
      if (isResolved) return;
      clearTimeout(timeoutId);
      isResolved = true;
      reject(err);
    });

    ff.on("close", (code) => {
      if (isResolved) return;
      clearTimeout(timeoutId);
      isResolved = true;
      if (code === 0) return resolve();
      reject(new Error(`FFmpeg failed (${label}): ${stderr.slice(-500)}`));
    });
  });
}

// FIX #4: Add proper error handling and stream closure
async function downloadToLocal(url, targetPath, label, sessionId, retries = 3) {
  let lastErr = null;

  for (let attempt = 1; attempt <= retries; attempt++) {
    let file = null;
    try {
      debug(`⬇️ Downloading ${label} (${attempt}/${retries})`, {
        sessionId,
        url,
      });

      const res = await fetch(url, {
        signal: AbortSignal.timeout(60000),
      });

      if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);

      file = fs.createWriteStream(targetPath);
      const reader = res.body.getReader();
      let bytes = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        bytes += value.length;
        file.write(value);
      }

      await new Promise((resolve, reject) => {
        file.end((err) => err ? reject(err) : resolve());
      });

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

      // Ensure stream is closed
      if (file) {
        try {
          file.destroy();
        } catch {}
      }

      try {
        await fs.promises.unlink(targetPath);
      } catch {}

      if (attempt < retries) {
        const delay = PODCAST_RETRY_DELAY_MS * Math.pow(PODCAST_RETRY_BACKOFF, attempt - 1);
        await new Promise((res) => setTimeout(res, delay));
      }
    }
  }

  throw new Error(
    `Failed to download ${label} after ${retries} attempts: ${lastErr?.message}`
  );
}

async function applyFades(sessionId, introPath, outroPath) {
  const introFaded = path.join(TMP_DIR, `${sessionId}_intro_faded.mp3`);
  const outroFaded = path.join(TMP_DIR, `${sessionId}_outro_faded.mp3`);

  await verifyAudioFile(introPath, "intro", sessionId);
  await verifyAudioFile(outroPath, "outro", sessionId);

  const introFadeFilter = `afade=t=in:st=0:d=${INTRO_FADE_SEC}`;
  
  await runFFmpeg(
    ["-y", "-i", introPath, "-af", introFadeFilter, introFaded],
    "fade-intro",
    sessionId
  );

  const outroFadeFilter = `afade=t=out:st=0:d=${OUTRO_FADE_SEC}`;
  
  await runFFmpeg(
    ["-y", "-i", outroPath, "-af", outroFadeFilter, outroFaded],
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
  try {
    const mainStats = await fs.promises.stat(mainPath);
    if (mainStats.size < MIN_FILE_SIZE) {
      throw new Error(`Main file too small: ${mainStats.size} bytes`);
    }
    debug(`✅ Main file size check passed: ${mainStats.size} bytes`, { sessionId });
  } catch (err) {
    throw new Error(`Main file validation failed: ${err.message}`);
  }

  await verifyAudioFile(introFaded, "faded intro", sessionId);
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

  try {
    const finalStats = await fs.promises.stat(outputPath);
    if (finalStats.size < MIN_FILE_SIZE) {
      throw new Error(`Final output too small: ${finalStats.size} bytes`);
    }
    debug(`✅ Final output size check passed: ${finalStats.size} bytes`, { sessionId });
  } catch (err) {
    throw new Error(`Final output validation failed: ${err.message}`);
  }
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
    const mainStats = await fs.promises.stat(mainPath);
    if (mainStats.size < MIN_FILE_SIZE) {
      throw new Error(`Main file too small: ${mainStats.size} bytes (min: ${MIN_FILE_SIZE})`);
    }
    
    debug(`✅ Main file validation passed`, {
      sessionId,
      fileSize: mainStats.size,
      attempt: `${attempt}/${total}`
    });
  } catch (err) {
    warn(`❌ Main file validation failed`, {
      sessionId,
      error: err.message,
      attempt: `${attempt}/${total}`
    });
    throw err;
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

  // FIX #5: Validate buffer before processing
  info("🔍 podcastProcessor called", {
    sessionId,
    bufferType: typeof editedBuffer,
    isBuffer: Buffer.isBuffer(editedBuffer),
    bufferLength: editedBuffer?.length || 0,
  });

  if (!editedBuffer || !Buffer.isBuffer(editedBuffer) || editedBuffer.length === 0) {
    error("❌ Invalid editedBuffer provided to podcastProcessor", {
      sessionId,
      bufferType: typeof editedBuffer,
      isBuffer: Buffer.isBuffer(editedBuffer),
      length: editedBuffer?.length || 0
    });
    throw new Error("Invalid or empty editedBuffer provided");
  }

  if (editedBuffer.length < 100) {
    error("❌ Edited buffer appears corrupted or incomplete", {
      sessionId,
      bufferLength: editedBuffer.length,
    });
    
    warn("🔄 Attempting recovery by fetching from R2", { sessionId });
    
    try {
      const editedUrl = `${process.env.R2_PUBLIC_BASE_URL_EDITED}/${sessionId}_edited.mp3`;
      const response = await fetch(editedUrl, { signal: AbortSignal.timeout(30000) });
      
      if (response.ok) {
        const recoveredBuffer = await response.arrayBuffer();
        if (recoveredBuffer.byteLength < 100) {
          throw new Error("Recovered buffer still too small");
        }
        editedBuffer = Buffer.from(recoveredBuffer);
        info("✅ Successfully recovered audio from R2", {
          sessionId,
          recoveredSize: editedBuffer.length
        });
      } else {
        throw new Error(`Could not recover from R2: ${response.status}`);
      }
    } catch (recoveryErr) {
      error("❌ Recovery failed", { sessionId, error: recoveryErr.message });
      throw new Error(`Buffer too small and recovery failed: ${recoveryErr.message}`);
    }
  }

  const introPath = path.join(TMP_DIR, `${sessionId}_intro.mp3`);
  const mainPath = path.join(TMP_DIR, `${sessionId}_main.mp3`);
  const outroPath = path.join(TMP_DIR, `${sessionId}_outro.mp3`);
  const finalPath = path.join(TMP_DIR, `${sessionId}_final.mp3`);

  try {
    info("💾 Writing main audio file", {
      sessionId,
      bufferSize: editedBuffer.length,
      targetPath: mainPath
    });

    await fs.promises.writeFile(mainPath, editedBuffer);

    const writtenStats = await fs.promises.stat(mainPath);
    info("📊 File write verification", {
      sessionId,
      expectedSize: editedBuffer.length,
      actualSize: writtenStats.size,
      match: writtenStats.size === editedBuffer.length
    });

    if (writtenStats.size !== editedBuffer.length) {
      warn(`⚠️ File write size mismatch`, {
        sessionId,
        expected: editedBuffer.length,
        actual: writtenStats.size,
        difference: Math.abs(editedBuffer.length - writtenStats.size)
      });
    }

    if (writtenStats.size < MIN_FILE_SIZE && editedBuffer.length >= MIN_FILE_SIZE) {
      error("❌ File write corruption detected", {
        sessionId,
        originalBuffer: editedBuffer.length,
        writtenFile: writtenStats.size
      });
      throw new Error(`File write failed: wrote ${writtenStats.size} bytes but expected ${editedBuffer.length}`);
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
        if (buf.length === 0) throw new Error("Empty output file");

        finalBuffer = buf;
        break;
      } catch (err) {
        lastError = err;

        warn(`⚠️ Pipeline attempt ${attempt}/${MAX_PODCAST_RETRIES} failed`, {
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

    if (!finalBuffer) {
      throw new Error(
        `Pipeline failed after ${MAX_PODCAST_RETRIES} attempts: ${lastError?.message}`
      );
    }

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
        size: finalBuffer.length,
      });
    } catch (uploadErr) {
      error("❌ Podcast upload failed", {
        sessionId,
        error: uploadErr.message,
      });
      throw uploadErr;
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
