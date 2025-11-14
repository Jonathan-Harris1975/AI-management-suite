// ============================================================
// 🎚️ Editing Processor — Hybrid Mastering (Stage 1)
// ============================================================
//
// Uses merged MP3 from R2 as the ONLY input.
// Steps:
//   1) Download merged MP3 → /tmp/edited_audio/<sessionId>_raw.mp3
//   2) Run ffmpeg locally (NO remote streaming!)
//   3) Apply minimal mastering:
//        • highpass 110Hz
//        • equalizer 7kHz, narrow notch anti-harshness
//        • gentle compression
//      (NO loudnorm – performed later in podcastProcessor)
//   4) Upload edited MP3 as safenet
//   5) If anything fails → return original merged MP3
//
// ============================================================

import fs from "fs";
import path from "path";
import { spawn } from "child_process";
import { info, warn, error } from "#logger.js";
import { startKeepAlive, stopKeepAlive } from "#shared/keepalive.js";
import { putObject } from "#shared/r2-client.js";

// ------------------------------------------------------------
// ⚙ ENV
// ------------------------------------------------------------
const TMP_DIR = "/tmp/edited_audio";

const MAX_RETRIES = Number(process.env.MAX_EDIT_RETRIES || 3);
const RETRY_DELAY_MS = Number(process.env.EDIT_RETRY_DELAY_MS || 2000);
const RETRY_BACKOFF = Number(process.env.RETRY_BACKOFF_MULTIPLIER || 2);

const MERGED_BASE = process.env.R2_PUBLIC_BASE_URL_MERGE || "";
const EDITED_BUCKET = process.env.R2_BUCKET_EDITED_AUDIO || "";
const PUBLIC_EDITED_BASE =
  process.env.R2_PUBLIC_BASE_URL_EDITED_AUDIO || "";

// ensure /tmp exists
if (!fs.existsSync(TMP_DIR)) {
  fs.mkdirSync(TMP_DIR, { recursive: true });
}

// ------------------------------------------------------------
// 🎚 Filter chain (safe for Debian builds)
// ------------------------------------------------------------
function ffmpegStage1Filter() {
  return [
    "highpass=f=110",
    "equalizer=f=7000:t=h:w=200:g=-6",
    "acompressor=threshold=-20dB:ratio=2:attack=10:release=80"
  ].join(",");
}

// ------------------------------------------------------------
// 📥 Download merged MP3 locally
// ------------------------------------------------------------
async function downloadMergedToLocal(sessionId, mergedUrl, localPath) {
  const res = await fetch(mergedUrl);

  if (!res.ok) {
    throw new Error(`Download failed ${res.status}: ${mergedUrl}`);
  }

  const arr = await res.arrayBuffer();
  const buf = Buffer.from(arr);

  if (buf.length < 1000) {
    throw new Error(
      `Downloaded merged MP3 too small (${buf.length} bytes)`
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
// 🔁 ffmpeg execution (local → local)
// ------------------------------------------------------------
function runEditingOnce(sessionId, inputLocalPath, outputLocalPath, attempt, total) {
  const filters = ffmpegStage1Filter();

  const args = [
    "-y",
    "-i",
    inputLocalPath,
    "-filter:a",
    filters,
    "-c:a",
    "libmp3lame",
    "-b:a",
    "128k",
    outputLocalPath,
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

    ff.on("error", reject);

    ff.on("close", (code) => {
      if (code === 0) return resolve();
      reject(new Error(`ffmpeg exited with code ${code}: ${stderr}`));
    });
  });
}

// ------------------------------------------------------------
// 🎧 Main
// ------------------------------------------------------------
export async function editingProcessor(sessionId) {
  const label = `editingProcessor:${sessionId}`;
  startKeepAlive(label, 15000);

  if (!MERGED_BASE) {
    stopKeepAlive(label);
    throw new Error("Missing R2_PUBLIC_BASE_URL_MERGE");
  }

  const mergedUrl = `${MERGED_BASE}/${encodeURIComponent(sessionId + ".mp3")}`;
  const rawLocal = path.join(TMP_DIR, `${sessionId}_raw.mp3`);
  const editedLocal = path.join(TMP_DIR, `${sessionId}_edited.mp3`);

  info("🔗 Using merged MP3 as editing input", {
    sessionId,
    mergedUrl,
    rawLocal,
    editedLocal,
  });

  // ------------------------------------------------------------
  // 1) Download merged MP3 locally (retry protected)
  // ------------------------------------------------------------
  let mergedBuffer = null;
  try {
    mergedBuffer = await downloadMergedToLocal(sessionId, mergedUrl, rawLocal);
  } catch (err) {
    stopKeepAlive(label);
    error("💥 Failed to download merged MP3", {
      sessionId,
      error: err.message,
    });
    throw err;
  }

  // ------------------------------------------------------------
  // 2) ffmpeg retry loop
  // ------------------------------------------------------------
  let finalBuffer = null;
  let lastErr = null;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      // Ensure no stale file
      try {
        await fs.promises.unlink(editedLocal);
      } catch {}

      await runEditingOnce(
        sessionId,
        rawLocal,
        editedLocal,
        attempt,
        MAX_RETRIES
      );

      finalBuffer = await fs.promises.readFile(editedLocal);

      info("✅ editingProcessor produced cleaned audio", {
        sessionId,
        bytes: finalBuffer.length,
        attempt,
      });

      break;
    } catch (err) {
      lastErr = err;

      warn("⚠️ editingProcessor ffmpeg attempt failed", {
        sessionId,
        attempt,
        error: err.message,
      });

      if (attempt < MAX_RETRIES) {
        const delay =
          RETRY_DELAY_MS * Math.pow(RETRY_BACKOFF, attempt - 1);

        info("🔁 Retrying after delay", {
          sessionId,
          attempt,
          nextInMs: delay,
        });

        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }

  stopKeepAlive(label);

  // ------------------------------------------------------------
  // 3) Total failure → return unedited merged MP3
  // ------------------------------------------------------------
  if (!finalBuffer) {
    error("💥 editingProcessor failed all retries — returning raw merged MP3", {
      sessionId,
      error: lastErr?.message,
    });
    return mergedBuffer;
  }

  // ------------------------------------------------------------
  // 4) Safenet upload to R2
  // ------------------------------------------------------------
  if (EDITED_BUCKET && PUBLIC_EDITED_BASE) {
    try {
      const key = `${sessionId}_edited.mp3`;

      await putObject(EDITED_BUCKET, key, finalBuffer, "audio/mpeg");

      info("💾 editingProcessor safenet upload OK", {
        sessionId,
        bucket: EDITED_BUCKET,
        key,
        publicUrl: `${PUBLIC_EDITED_BASE}/${encodeURIComponent(key)}`,
      });
    } catch (err) {
      warn("⚠️ Failed safenet upload", {
        sessionId,
        error: err.message,
      });
    }
  }

  return finalBuffer;
}

export default editingProcessor;
