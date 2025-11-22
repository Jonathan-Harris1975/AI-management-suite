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
  process.env.PODCAST_RETRY_DELAY_MS || process.env.RETRY_DELAY_MS || 2000
);

const PODCAST_RETRY_BACKOFF = Number(
  process.env.RETRY_BACKOFF_MULTIPLIER || 2
);

const PODCAST_FFMPEG_TIMEOUT_MS = Number(
  process.env.PODCAST_FFMPEG_TIMEOUT_MS || 5 * 60 * 1000
);

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

        info("🧹 Delayed cleanup completed", {
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

  info("⏰ Scheduled delayed cleanup", {
    sessionId,
    delayMs: CLEANUP_DELAY_MS,
    scheduledAt: new Date().toISOString(),
  });
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
      if (res.ok && res.headers.get("content-type")?.includes("application/json")) {
        existing = await res.json();
      }
    } catch (err) {
      debug("ℹ️ Meta file not found or fetch failed", {
        sessionId,
        error: err.message,
      });
    }
  }

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

  await putObject(
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
          PODCAST_RETRY_DELAY_MS * Math.pow(PODCAST_RETRY_BACKOFF, attempt - 1);
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

  // User confirmed: key is just the sessionId, no suffix.
  const editedUrl = `${base}/${sessionId}.mp3`;

  let editedBufferFromR2 = null;
  let lastErr = null;

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
      editedBufferFromR2 = Buffer.from(arrBuf);

      if (editedBufferFromR2.length < MIN_FILE_SIZE) {
        throw new Error(
          `Edited audio from R2 too small: ${editedBufferFromR2.length} bytes`
        );
      }

      info("✅ Retrieved edited audio from R2", {
        sessionId,
        size: editedBufferFromR2.length,
      });
      break;
    } catch (fetchErr) {
      lastErr = fetchErr;
      warn("⚠️ Failed to fetch edited audio from R2", {
        sessionId,
        attempt,
        error: fetchErr.message,
      });

      if (attempt < MAX_PODCAST_RETRIES) {
        const delay =
          PODCAST_RETRY_DELAY_MS * Math.pow(PODCAST_RETRY_BACKOFF, attempt - 1);
        await new Promise((res) => setTimeout(res, delay));
      }
    }
  }

  if (!editedBufferFromR2) {
    throw new Error(
      `Unable to retrieve edited audio from R2 after ${MAX_PODCAST_RETRIES} attempts: ${lastErr?.message}`
    );
  }

  return editedBufferFromR2;
}

async function writeMainToDisk(sessionId, mainPath, buffer) {
  info("💾 Writing main audio file from R2 buffer", {
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

    const intermediateFiles = sessionFiles.filter(
      (f) => !f.includes("_final.mp3")
    );

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

// ---------- Core FFmpeg concat (demuxer) ----------

async function buildConcatListFile(sessionId, introPath, mainPath, outroPath, listPath) {
  const lines = [
    `file '${introPath.replace(/'/g, "'\''")}'`,
    `file '${mainPath.replace(/'/g, "'\''")}'`,
    `file '${outroPath.replace(/'/g, "'\''")}'`,
  ].join("\n");

  await fs.promises.writeFile(listPath, lines, "utf8");

  debug("📝 Created concat list file", {
    sessionId,
    listPath,
    lines: 3,
  });
}

async function concatWithDemuxer(sessionId, introPath, mainPath, outroPath, finalPath) {
  const listPath = path.join(TMP_DIR, `${sessionId}_concat_list.txt`);

  await verifyFileSize(introPath, "intro", sessionId);
  await verifyFileSize(mainPath, "main", sessionId);
  await verifyFileSize(outroPath, "outro", sessionId);

  await buildConcatListFile(sessionId, introPath, mainPath, outroPath, listPath);

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

  await runFFmpeg(args, "concat-demuxer", sessionId);

  await verifyFileSize(finalPath, "final podcast", sessionId);
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

  await concatWithDemuxer(sessionId, introPath, mainPath, outroPath, finalPath);

  debug("🎧 Podcast concat attempt complete", {
    sessionId,
    attempt: `${attempt}/${total}`,
  });
}

// ---------- Orchestrator ----------

export async function podcastProcessor(sessionId, editedBuffer) {
  const keepAliveId = `podcastProcessor:${sessionId}`;

  if (!PODCAST_INTRO_URL || !PODCAST_OUTRO_URL) {
    warn("⚠️ Missing intro/outro URL", { sessionId });
    return editedBuffer;
  }

  info("🔍 podcastProcessor called", {
    sessionId,
    incomingBufferType: typeof editedBuffer,
    incomingIsBuffer: Buffer.isBuffer(editedBuffer),
    incomingBufferLength: editedBuffer?.length || 0,
    strategy: "R2_SOURCE_OF_TRUTH_STEREO_CONCAT",
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

    // 6. Cleanup intermediates (keep _final until upload/meta done)
    await immediateCleanupTempFiles(sessionId);

    // 7. Upload final podcast to R2
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

    // 8. Update metadata (best effort)
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

    // 9. Schedule delayed full cleanup
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
