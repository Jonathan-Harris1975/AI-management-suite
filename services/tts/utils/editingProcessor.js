// ============================================================
// 🎚️ Editing Processor — Hybrid Mastering (Stage 1)
// ============================================================
//
// Input:
//   • Merged MP3 from MERGED public base (R2_PUBLIC_BASE_URL_MERGE)
//     → downloaded to /tmp/edited_audio/<sessionId>_raw.mp3
//
// Output:
//   • Edited MP3 at /tmp/edited_audio/<sessionId>_edited.mp3
//   • Safenet upload to R2_BUCKET_EDITED_AUDIO
//
// Safety:
//   • ffmpeg uses -xerror → hard fail on decode error
//   • Output must be >= 10 KB or it is treated as corrupt
//   • On total failure, returns original merged MP3 from R2
// ============================================================

import fs from "fs";
import path from "path";
import { spawn } from "child_process";
import { info, warn, error } from "#logger.js";
import { startKeepAlive, stopKeepAlive } from "#shared/keepalive.js";
import { putObject } from "#shared/r2-client.js";

const TMP_DIR = "/tmp/edited_audio";
const MIN_VALID_BYTES = 10 * 1024; // 10 KB

const MAX_RETRIES = Number(
  process.env.MAX_EDIT_RETRIES ||
    process.env.MAX_CHUNK_RETRIES ||
    3
);

const RETRY_DELAY_MS = Number(
  process.env.EDIT_RETRY_DELAY_MS ||
    process.env.RETRY_DELAY_MS ||
    2000
);

const RETRY_BACKOFF = Number(
  process.env.RETRY_BACKOFF_MULTIPLIER || 2
);

const MERGED_BASE = process.env.R2_PUBLIC_BASE_URL_MERGE || "";

const EDITED_BUCKET = process.env.R2_BUCKET_EDITED_AUDIO || "";
const PUBLIC_EDITED_BASE =
  process.env.R2_PUBLIC_BASE_URL_EDITED_AUDIO || "";

if (!fs.existsSync(TMP_DIR)) {
  fs.mkdirSync(TMP_DIR, { recursive: true });
}

// ------------------------------------------------------------
// 🎚️ Stage 1 Filter Chain (no loudnorm; that happens later)
// ------------------------------------------------------------
function ffmpegStage1Filter() {
  return [
    "highpass=f=110",
    "equalizer=f=7000:t=h:w=200:g=-6",
    "acompressor=threshold=-20dB:ratio=2:attack=10:release=80",
  ].join(",");
}

// ------------------------------------------------------------
// 📥 Download merged MP3 from R2 → local file
// ------------------------------------------------------------
async function downloadMergedToLocal(sessionId, mergedUrl, localPath) {
  const fetchFn = globalThis.fetch;
  if (!fetchFn) {
    throw new Error("fetch not available; cannot download merged MP3");
  }

  const res = await fetchFn(mergedUrl);
  if (!res.ok) {
    throw new Error(
      `Failed to download merged MP3: HTTP ${res.status}`
    );
  }

  const buf = Buffer.from(await res.arrayBuffer());

  if (buf.length < MIN_VALID_BYTES) {
    throw new Error(
      `Merged MP3 too small or invalid (bytes=${buf.length})`
    );
  }

  await fs.promises.writeFile(localPath, buf);

  info("⬇️ Downloaded merged MP3 locally", {
    sessionId,
    bytes: buf.length,
    localPath,
  });

  return buf;
}

// ------------------------------------------------------------
// 🛰️ Fallback: fetch merged MP3 as Buffer (no local file used)
// ------------------------------------------------------------
async function fetchMergedBuffer(mergedUrl) {
  const fetchFn = globalThis.fetch;
  if (!fetchFn) {
    throw new Error(
      "fetch not available; cannot download merged MP3 fallback"
    );
  }

  const res = await fetchFn(mergedUrl);
  if (!res.ok) {
    throw new Error(
      `Failed to fetch merged MP3 fallback: HTTP ${res.status}`
    );
  }

  const buf = Buffer.from(await res.arrayBuffer());

  if (buf.length < MIN_VALID_BYTES) {
    throw new Error(
      `Merged MP3 fallback too small or invalid (bytes=${buf.length})`
    );
  }

  return buf;
}

// ------------------------------------------------------------
// 🔁 Run ffmpeg once (LOCAL INPUT)
// ------------------------------------------------------------
function runEditingOnce(
  sessionId,
  inputPath,
  outputPath,
  attempt,
  total
) {
  const filters = ffmpegStage1Filter();

  const args = [
    "-y",
    "-xerror", // 🔥 hard fail on decode error
    "-i",
    inputPath,
    "-filter:a",
    filters,
    "-c:a",
    "libmp3lame",
    "-b:a",
    "128k",
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
    let stderr = "";

    ff.stderr.on("data", (buf) => {
      const txt = buf.toString();
      stderr += txt;
      if (txt.toLowerCase().includes("error")) {
        warn("⚠️ ffmpeg stderr (editingProcessor)", {
          sessionId,
          attempt,
          stderr: txt,
        });
      }
    });

    ff.on("error", (err) => reject(err));

    ff.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(
          new Error(
            `ffmpeg exited with code ${code}: ${stderr}`
          )
        );
      }
    });
  });
}

// ------------------------------------------------------------
// 🎧 editingProcessor — Main
// ------------------------------------------------------------
// NOTE: second parameter is ignored so orchestrator signature
//       `editingProcessor(sessionId, buffer)` still works.
export async function editingProcessor(
  sessionId,
  _unusedAudioBuffer
) {
  const label = `editingProcessor:${sessionId}`;
  startKeepAlive(label, 15000);

  if (!MERGED_BASE) {
    stopKeepAlive(label);
    throw new Error(
      "R2_PUBLIC_BASE_URL_MERGE is not set; cannot run editingProcessor"
    );
  }

  const mergedUrl = `${MERGED_BASE}/${encodeURIComponent(
    `${sessionId}.mp3`
  )}`;
  const rawLocal = path.join(TMP_DIR, `${sessionId}_raw.mp3`);
  const editedLocal = path.join(
    TMP_DIR,
    `${sessionId}_edited.mp3`
  );

  info("🔗 Using merged MP3 as editing input", {
    sessionId,
    mergedUrl,
    rawLocal,
    editedLocal,
  });

  let finalBuffer = null;
  let lastError = null;

  try {
    // Download merged MP3 once per run
    await downloadMergedToLocal(
      sessionId,
      mergedUrl,
      rawLocal
    );
  } catch (err) {
    stopKeepAlive(label);
    error("💥 Failed to download merged MP3 for editing", {
      sessionId,
      error: err.message,
    });
    // If we can't even download the merged file, bail
    throw err;
  }

  // 🔁 Retry loop
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      // remove stale output if any
      try {
        await fs.promises.unlink(editedLocal);
      } catch {
        // ignore
      }

      await runEditingOnce(
        sessionId,
        rawLocal,
        editedLocal,
        attempt,
        MAX_RETRIES
      );

      const candidate = await fs.promises.readFile(
        editedLocal
      );

      if (candidate.length < MIN_VALID_BYTES) {
        throw new Error(
          `Edited MP3 too small or invalid (bytes=${candidate.length})`
        );
      }

      finalBuffer = candidate;

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
        maxAttempts: MAX_RETRIES,
      });

      if (attempt < MAX_RETRIES) {
        const delay =
          RETRY_DELAY_MS *
          Math.pow(RETRY_BACKOFF, attempt - 1);

        info("🔁 Retrying editingProcessor after delay", {
          sessionId,
          attempt,
          nextInMs: delay,
        });

        await new Promise((resolve) =>
          setTimeout(resolve, delay)
        );
      }
    }
  }

  stopKeepAlive(label);

  // Cleanup temp edited file (best-effort)
  try {
    await fs.promises.unlink(editedLocal);
  } catch {
    // ignore
  }

  // ❌ All attempts failed → fall back to original merged MP3
  if (!finalBuffer) {
    error(
      "💥 editingProcessor failed after all retries — returning original merged audio",
      {
        sessionId,
        error: lastError?.message,
      }
    );

    try {
      const fallbackBuffer = await fetchMergedBuffer(
        mergedUrl
      );

      info(
        "🛟 Returned original merged MP3 as editing fallback",
        {
          sessionId,
          bytes: fallbackBuffer.length,
        }
      );

      return fallbackBuffer;
    } catch (fallbackErr) {
      error(
        "💥 editingProcessor fallback to merged MP3 also failed",
        {
          sessionId,
          error: fallbackErr.message,
        }
      );
      throw lastError || fallbackErr;
    }
  }

  // 📦 Safenet R2 Upload
  if (EDITED_BUCKET && PUBLIC_EDITED_BASE) {
    try {
      const key = `${sessionId}_edited.mp3`;

      await putObject(
        EDITED_BUCKET,
        key,
        finalBuffer,
        "audio/mpeg"
      );

      info("💾 editingProcessor safenet upload OK", {
        sessionId,
        bucket: EDITED_BUCKET,
        key,
        publicUrl: `${PUBLIC_EDITED_BASE}/${encodeURIComponent(
          key
        )}`,
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
