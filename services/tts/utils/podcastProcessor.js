import fs from "fs";
import path from "path";
import { spawn } from "child_process";
import { info, warn, error, debug } from "#logger.js";
import { startKeepAlive, stopKeepAlive } from "#shared/keepalive.js";
import { putObject } from "#shared/r2-client.js";

const TMP_DIR = "/tmp/podcast_master";

const PODCAST_INTRO_URL = process.env.PODCAST_INTRO_URL || "";
const PODCAST_OUTRO_URL = process.env.PODCAST_OUTRO_URL || "";

const CLEANUP_DELAY_MS = 2 * 60 * 1000; // 2-minute delay for cleanup

const MAX_PODCAST_RETRIES = Number(
  process.env.MAX_PODCAST_RETRIES || process.env.MAX_CHUNK_RETRIES || 3
);

const PODCAST_RETRY_DELAY_MS = Number(
  process.env.MAX_PODCAST_RETRY_DELAY_MS || // allow a podcast-specific override
    process.env.PODCAST_RETRY_DELAY_MS || // backwards compat
    process.env.RETRY_DELAY_MS || 2000
);

const PODCAST_RETRY_BACKOFF = Number(
  process.env.PODCAST_RETRY_BACKOFF || process.env.RETRY_BACKOFF_MULTIPLIER || 2
);

// Fixed, explicit timeout – no dynamic maths, no NaN
const PODCAST_FFMPEG_TIMEOUT_MS =
  Number(process.env.PODCAST_FFMPEG_TIMEOUT_MS) || 180_000; // 3 minutes default

const MIN_FILE_SIZE = 100 * 1024; // 100KB minimum file size

if (!fs.existsSync(TMP_DIR)) {
  fs.mkdirSync(TMP_DIR, { recursive: true });
}

// ---------- Helpers ----------

function scheduleDelayedCleanup(sessionId) {
  setTimeout(async () => {
    try {
      const files = await fs.promises.readdir(TMP_DIR);
      const sessionFiles = files.filter((f) => f.includes(sessionId));

      if (sessionFiles.length > 0) {
        await Promise.allSettled(
          sessionFiles.map((f) => fs.promises.unlink(path.join(TMP_DIR, f)))
        );

        debug("🧹 Delayed cleanup completed", {
          sessionId,
          files: sessionFiles.length,
          delay: "2 minutes",
        });
      }
    } catch (cleanupErr) {
      warn("⚠️ Delayed cleanup error", {
        sessionId,
        error: cleanupErr.message,
      });
    }
  }, CLEANUP_DELAY_MS);

  debug("⏰ Scheduled delayed cleanup", {
    sessionId,
    delayMs: CLEANUP_DELAY_MS,
    scheduledAt: new Date().toISOString(),
  });
}

/**
 * Wrapper around putObject that:
 *  - normalises/sanitises contentType
 *  - retries once without contentType if Node throws ERR_INVALID_CHAR
 */
async function safePutObject(bucketAlias, key, body, options) {
  let cleanOptions = options;

  if (options && typeof options.contentType !== "undefined") {
    const ct = String(options.contentType)
      // strip any control chars that break HTTP headers
      .replace(/[\r\n\t]+/g, " ")
      .trim();

    cleanOptions = { ...options, contentType: ct };
  }

  try {
    if (cleanOptions) {
      return await putObject(bucketAlias, key, body, cleanOptions);
    }
    return await putObject(bucketAlias, key, body);
  } catch (err) {
    const msg = String(err?.message || "");
    const isHeaderError =
      err?.code === "ERR_INVALID_CHAR" ||
      msg.includes('Invalid character in header content ["content-type"]');

    if (!isHeaderError) {
      throw err;
    }

    // Retry without any contentType hint
    warn("⚠️ Retrying putObject without contentType due to invalid header", {
      bucketAlias,
      key,
      error: err.message,
    });

    return await putObject(bucketAlias, key, body);
  }
}

async function updateMetaFile(sessionId, finalBuffer, finalPath, podcastUrl) {
  const cleanId = sessionId;
  const metaKey = `${cleanId}.json`;

  const metaBaseUrl = process.env.R2_PUBLIC_BASE_URL_META || "";
  const artBaseUrl = process.env.R2_PUBLIC_BASE_URL_ART || "";
  const transcriptBaseUrl =
    process.env.R2_PUBLIC_BASE_URL_TRANSCRIPT ||
    process.env.R2_PUBLIC_BASE_URL_RAW_TEXT ||
    "";

  const metaUrl = metaBaseUrl ? `${metaBaseUrl}/${metaKey}` : "";

  let existing = {};

  if (metaUrl) {
    try {
      const res = await fetch(metaUrl, { signal: AbortSignal.timeout(10000) });
      if (
        res.ok &&
        res.headers.get("content-type")?.includes("application/json")
      ) {
        existing = await res.json();
      }
    } catch (err) {
      debug("ℹ️ Meta file not found or fetch failed", {
        sessionId,
        error: err.message,
      });
    }
  }

  // Duration via ffprobe (best effort; failure is non-fatal)
  let duration = null;
  try {
    const { stdout, status } = await new Promise((resolve) => {
      const ff = spawn(
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
        { stdio: ["ignore", "pipe", "pipe"] }
      );

      let out = "";
      ff.stdout.on("data", (d) => (out += d.toString()));
      ff.on("close", (code) => resolve({ stdout: out, status: code }));
    });

    if (status === 0 && stdout) {
      const d = parseFloat(stdout.trim());
      if (!Number.isNaN(d)) duration = d;
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
    artUrl: artBaseUrl ? `${artBaseUrl}/${cleanId}.png` : existing.artUrl,
    transcriptUrl: transcriptBaseUrl
      ? `${transcriptBaseUrl}/${cleanId}.txt`
      : existing.transcriptUrl,
    podcastUrl,
    duration,
    fileSize,
    pubDate,
    updatedAt: new Date().toISOString(),
  };

  await safePutObject(
    "meta",
    metaKey,
    Buffer.from(JSON.stringify(updated, null, 2)),
    { contentType: "application/json" }
  );

  return { metaKey, metaUrl };
}

async function verifyFileSize(filePath, label, sessionId) {
  const stats = await fs.promises.stat(filePath);
  if (stats.size < MIN_FILE_SIZE) {
    throw new Error(
      `${label} too small: ${stats.size} bytes (min: ${MIN_FILE_SIZE})`
    );
  }
  debug(`✅ Size check passed for ${label}`, {
    sessionId,
    filePath,
    size: stats.size,
  });
  return stats.size;
}

// FFmpeg runner with fixed timeout (no NaN, no dynamic maths)
function runFFmpeg(
  args,
  label,
  sessionId,
  timeoutMs = PODCAST_FFMPEG_TIMEOUT_MS
) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const ff = spawn("ffmpeg", args, {
      stdio: ["ignore", "pipe", "pipe"],
      detached: false,
    });

    let stderr = "";
    let isResolved = false;

    const timeoutId = setTimeout(() => {
      if (isResolved) return;

      const elapsed = Date.now() - start;
      warn(`⚠️ FFmpeg timeout: ${label}`, {
        sessionId,
        timeoutMs,
        elapsed,
      });

      isResolved = true;

      try {
        ff.kill("SIGTERM");
        const hardKillTimeout = setTimeout(() => {
          try {
            ff.kill("SIGKILL");
          } catch (err) {
            debug("Error force-killing ffmpeg", { error: err.message });
          }
        }, 5000);
        ff.once("exit", () => clearTimeout(hardKillTimeout));
      } catch (killErr) {
        debug("Error terminating ffmpeg process", { error: killErr.message });
      }

      reject(new Error(`FFmpeg timed out after ${timeoutMs}ms for ${label}`));
    }, timeoutMs);

    ff.stderr.on("data", (d) => {
      const chunk = d.toString();
      stderr += chunk;

      if (chunk.includes("frame=")) {
        const lastLines = chunk.split("\n").slice(-2).join(" ");
        debug(`📊 FFmpeg progress: ${label}`, {
          sessionId,
          lastLines,
        });
      }
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

      const elapsed = Date.now() - start;

      if (code === 0) {
        debug(`✅ FFmpeg completed: ${label}`, { sessionId, elapsed });
        return resolve();
      }

      const errorLines = stderr
        .split("\n")
        .filter((line) => {
          const lower = line.toLowerCase();
          return (
            lower.includes("error") ||
            lower.includes("invalid") ||
            lower.includes("failed")
          );
        })
        .slice(-3);

      reject(
        new Error(
          `FFmpeg failed (${label}, code ${code}, ${elapsed}ms): ${
            errorLines.join(" | ") || stderr.slice(-500)
          }`
        )
      );
    });
  });
}

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
        file.end((err) => (err ? reject(err) : resolve()));
      });

      if (bytes < MIN_FILE_SIZE) {
        throw new Error(`Downloaded file too small: ${bytes} bytes`);
      }

      await verifyFileSize(targetPath, label, sessionId);
      return;
    } catch (err) {
      lastErr = err;
      warn(`⚠️ Download failed for ${label}`, {
        sessionId,
        attempt,
        error: err.message,
      });

      if (file) {
        try {
          file.destroy();
        } catch {}
      }

      try {
        await fs.promises.unlink(targetPath);
      } catch {}

      if (attempt < retries) {
        const delay =
          PODCAST_RETRY_DELAY_MS *
          Math.pow(PODCAST_RETRY_BACKOFF, attempt - 1);
        await new Promise((res) => setTimeout(res, delay));
      }
    }
  }

  throw new Error(
    `Failed to download ${label} after ${retries} attempts: ${lastErr?.message}`
  );
}

async function fetchEditedAudioFromR2(sessionId) {
  const base = process.env.R2_PUBLIC_BASE_URL_EDITED_AUDIO;
  if (!base) {
    throw new Error("R2_PUBLIC_BASE_URL_EDITED_AUDIO is not configured");
  }

  // Primary pattern from your existing pipeline: <sessionId>_edited.mp3
  const candidates = [
    `${base}/${sessionId}_edited.mp3`,
    `${base}/${sessionId}.mp3`, // fallback if you ever switch naming
  ];

  let editedBufferFromR2 = null;
  let lastErr = null;

  for (const editedUrl of candidates) {
    for (let attempt = 1; attempt <= MAX_PODCAST_RETRIES; attempt++) {
      try {
        debug(
          `⬇️ Fetching edited audio from R2 (${attempt}/${MAX_PODCAST_RETRIES})`,
          {
            sessionId,
            editedUrl,
          }
        );

        const res = await fetch(editedUrl, {
          signal: AbortSignal.timeout(60000),
        });

        if (!res.ok) {
          throw new Error(`HTTP ${res.status} ${res.statusText}`);
        }

        const arrBuf = await res.arrayBuffer();
        const tmpBuf = Buffer.from(arrBuf);

        if (tmpBuf.length < MIN_FILE_SIZE) {
          throw new Error(
            `Edited audio from R2 too small: ${tmpBuf.length} bytes`
          );
        }

        editedBufferFromR2 = tmpBuf;
        info("🟩 Retrieved edited audio from R2");
        debug("✅ Retrieved edited audio from R2", {
          sessionId,
          size: editedBufferFromR2.length,
          url: editedUrl,
        });
        break;
      } catch (fetchErr) {
        lastErr = fetchErr;
        warn("⚠️ Failed to fetch edited audio from R2", {
          sessionId,
          attempt,
          url: editedUrl,
          error: fetchErr.message,
        });

        if (attempt < MAX_PODCAST_RETRIES) {
          const delay =
            PODCAST_RETRY_DELAY_MS *
            Math.pow(PODCAST_RETRY_BACKOFF, attempt - 1);
          await new Promise((res) => setTimeout(res, delay));
        }
      }
    }

    if (editedBufferFromR2) break;
  }

  if (!editedBufferFromR2) {
    throw new Error(
      `Unable to retrieve edited audio from R2 after ${MAX_PODCAST_RETRIES} attempts: ${lastErr?.message}`
    );
  }

  return editedBufferFromR2;
}

async function writeMainToDisk(sessionId, mainPath, buffer) {
  debug("💾 Writing main audio file from R2 buffer", {
    sessionId,
    bufferSize: buffer.length,
    targetPath: mainPath,
  });

  await fs.promises.writeFile(mainPath, buffer);
  await verifyFileSize(mainPath, "main audio", sessionId);
}

async function immediateCleanupTempFiles(sessionId) {
  try {
    const files = await fs.promises.readdir(TMP_DIR);
    const sessionFiles = files.filter((f) => f.includes(sessionId));

    // Keep mp3s until delayed cleanup; remove concat lists / temp metadata
    const intermediateFiles = sessionFiles.filter((f) => !f.endsWith(".mp3"));

    await Promise.allSettled(
      intermediateFiles.map((f) =>
        fs.promises.unlink(path.join(TMP_DIR, f))
      )
    );

    info("🧹 Immediate cleanup completed", {
      sessionId,
      files: intermediateFiles.length,
    });
  } catch (e) {
    warn("⚠️ Immediate cleanup error", { sessionId, error: e.message });
  }
}

// ---------- Bulletproof concat: FFmpeg + pure-buffer fallback ----------

async function fallbackConcatBuffers(
  sessionId,
  introPath,
  mainPath,
  outroPath,
  finalPath
) {
  const intro = await fs.promises.readFile(introPath);
  const main = await fs.promises.readFile(mainPath);
  const outro = await fs.promises.readFile(outroPath);

  const final = Buffer.concat([intro, main, outro]);

  await fs.promises.writeFile(finalPath, final);
  await verifyFileSize(finalPath, "final podcast (fallback)", sessionId);

  info("🎵 Fallback concat completed (pure buffer merge)", {
    sessionId,
    finalSize: final.length,
  });

  return final;
}

async function concatWithFFmpegOrFallback(
  sessionId,
  introPath,
  mainPath,
  outroPath,
  finalPath
) {
  const listPath = path.join(TMP_DIR, `${sessionId}_concat_list.txt`);

  await fs.promises.writeFile(
    listPath,
    [
      `file '${introPath}'`,
      `file '${mainPath}'`,
      `file '${outroPath}'`,
    ].join("\n"),
    "utf8"
  );

  const args = [
    "-y",
    "-f",
    "concat",
    "-safe",
    "0",
    "-i",
    listPath,
    "-c",
    "copy",
    finalPath,
  ];

  try {
    await verifyFileSize(introPath, "intro", sessionId);
    await verifyFileSize(mainPath, "main", sessionId);
    await verifyFileSize(outroPath, "outro", sessionId);

    await runFFmpeg(
      args,
      "concat-demuxer",
      sessionId,
      PODCAST_FFMPEG_TIMEOUT_MS
    );
    await verifyFileSize(finalPath, "final podcast (ffmpeg)", sessionId);

    info("🎧 FFmpeg concat succeeded", { sessionId });
    return await fs.promises.readFile(finalPath);
  } catch (err) {
    warn("⚠️ FFmpeg concat failed — using fallback", {
      sessionId,
      error: err.message,
    });

    return await fallbackConcatBuffers(
      sessionId,
      introPath,
      mainPath,
      outroPath,
      finalPath
    );
  }
}

// ---------- Pipeline ----------

async function runPodcastPipeline(
  sessionId,
  introPath,
  mainPath,
  outroPath,
  finalPath,
  attempt,
  total
) {
  debug("🎧 Starting podcast concat attempt", {
    sessionId,
    attempt: `${attempt}/${total}`,
    introPath,
    mainPath,
    outroPath,
    finalPath,
  });

  const finalBuffer = await concatWithFFmpegOrFallback(
    sessionId,
    introPath,
    mainPath,
    outroPath,
    finalPath
  );

  debug("🎧 Podcast concat attempt complete", {
    sessionId,
    attempt: `${attempt}/${total}`,
    finalBytes: finalBuffer.length,
  });

  return finalBuffer;
}

// ---------- Orchestrator ----------

export async function podcastProcessor(sessionId, editedBuffer) {
  const keepAliveId = `podcastProcessor:${sessionId}`;

  if (!PODCAST_INTRO_URL || !PODCAST_OUTRO_URL) {
    warn("⚠️ Missing intro/outro URL", { sessionId });
    return editedBuffer;
  }

  info("🎛️ podcastProcessor started ", { sessionId });
  debug("🔍 podcastProcessor called", {
    sessionId,
    incomingBufferType: typeof editedBuffer,
    incomingIsBuffer: Buffer.isBuffer(editedBuffer),
    incomingBufferLength: editedBuffer?.length || 0,
    strategy: "R2_SOURCE_OF_TRUTH_STEREO_CONCAT_WITH_FALLBACK",
    timeoutMs: PODCAST_FFMPEG_TIMEOUT_MS,
  });

  const introPath = path.join(TMP_DIR, `${sessionId}_intro.mp3`);
  const mainPath = path.join(TMP_DIR, `${sessionId}_main.mp3`);
  const outroPath = path.join(TMP_DIR, `${sessionId}_outro.mp3`);
  const finalPath = path.join(TMP_DIR, `${sessionId}_final.mp3`);

  try {
    // 1. Fetch edited stereo main audio from R2
    const editedBufferFromR2 = await fetchEditedAudioFromR2(sessionId);

    // 2. Write main to disk
    await writeMainToDisk(sessionId, mainPath, editedBufferFromR2);

    // 3. Start keep-alive (covers intro/outro download + concat)
    startKeepAlive(keepAliveId, 15000);

    // 4. Download intro/outro (stereo, already mastered)
    await downloadToLocal(PODCAST_INTRO_URL, introPath, "intro", sessionId);
    await downloadToLocal(PODCAST_OUTRO_URL, outroPath, "outro", sessionId);

    // 5. Run concat pipeline with retries
    let finalBuffer = null;
    let lastPipelineError = null;

    for (let attempt = 1; attempt <= MAX_PODCAST_RETRIES; attempt++) {
      try {
        try {
          await fs.promises.unlink(finalPath);
        } catch {}

        const buf = await runPodcastPipeline(
          sessionId,
          introPath,
          mainPath,
          outroPath,
          finalPath,
          attempt,
          MAX_PODCAST_RETRIES
        );

        if (!buf || buf.length === 0) {
          throw new Error("Empty output buffer");
        }

        finalBuffer = buf;
        break;
      } catch (err) {
        lastPipelineError = err;

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
        `Pipeline failed after ${MAX_PODCAST_RETRIES} attempts: ${lastPipelineError?.message}`
      );
    }

    // 6. Cleanup intermediates (keep mp3s until delayed cleanup)
    await immediateCleanupTempFiles(sessionId);

    // 7. Upload final podcast to R2 (with safe header handling)
    const podcastKey = `${sessionId}_podcast.mp3`;
    const podcastUrl = `${process.env.R2_PUBLIC_BASE_URL_PODCAST}/${podcastKey}`;

    try {
      await safePutObject("podcast", podcastKey, finalBuffer, {
        contentType: "audio/mpeg",
      });
      info("📡 Uploaded final podcast");
      debug("📡 Uploaded final podcast", {
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

    // 8. Update metadata (best effort)
    
