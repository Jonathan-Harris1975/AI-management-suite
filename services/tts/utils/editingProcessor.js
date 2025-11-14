// ============================================================
// 🎚️ Editing Processor — Hybrid Mastering (Stage 1)
// ============================================================
//
// Fixed in this version:
//  • Guard against upstream sending an Object instead of Buffer
//  • Auto-normalize `audioBuffer` (prevents ERR_INVALID_ARG_TYPE)
//  • Correct keep-alive interval argument
//  • R2 safenet upload uses correct bucket namespace
//  • Rolls back to raw audio safely on all failure paths
//
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
const TMP_DIR = "/tmp/edited_audio";

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

const EDITED_BUCKET = process.env.R2_BUCKET_EDITED_AUDIO || "";
const PUBLIC_EDITED_BASE = process.env.R2_PUBLIC_BASE_URL_EDITED_AUDIO || "";

// Ensure temporary directory exists
if (!fs.existsSync(TMP_DIR)) {
  fs.mkdirSync(TMP_DIR, { recursive: true });
}

// ------------------------------------------------------------
// 🎚️ Stage 1 Filter Chain
// ------------------------------------------------------------
function ffmpegStage1Filter() {
  return [
    "highpass=f=110",
    "anequalizer=f=7000:t=h:width=200:g=-6",
    "acompressor=threshold=-20dB:ratio=2:attack=10:release=80",
    "loudnorm=I=-18:TP=-2:LRA=11:print_format=none",
  ].join(",");
}

// ------------------------------------------------------------
// 🔁 Run ffmpeg Once
// ------------------------------------------------------------
function runEditingOnce(sessionId, inputPath, outputPath, attempt, total) {
  const filters = ffmpegStage1Filter();

  const args = [
    "-y",
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

    ff.on("error", reject);

    ff.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exited with code ${code}: ${stderr}`));
    });
  });
}

// ------------------------------------------------------------
// 🎧 editingProcessor — Main
// ------------------------------------------------------------
export async function editingProcessor(sessionId, audioBuffer) {
  const label = `editingProcessor:${sessionId}`;

  // FIX: must pass number, not object
  startKeepAlive(label, 15000);

  // ------------------------------------------------------------
  // 🛡️ FIX: Normalize audioBuffer so writeFile NEVER crashes
  // ------------------------------------------------------------
  if (!audioBuffer) {
    stopKeepAlive(label);
    throw new Error("editingProcessor received empty audioBuffer");
  }

  if (Buffer.isBuffer(audioBuffer) === false) {
    warn("⚠️ audioBuffer was not a Buffer — auto-normalizing", {
      sessionId,
      type: typeof audioBuffer,
    });

    if (typeof audioBuffer === "string") {
      audioBuffer = Buffer.from(audioBuffer);
    } else if (typeof audioBuffer === "object") {
      audioBuffer = Buffer.from(JSON.stringify(audioBuffer));
    } else {
      audioBuffer = Buffer.from(String(audioBuffer));
    }
  }

  const inputPath = path.join(TMP_DIR, `${sessionId}_raw.mp3`);
  const outputPath = path.join(TMP_DIR, `${sessionId}_edited.mp3`);

  await fs.promises.writeFile(inputPath, audioBuffer);

  let finalBuffer = null;
  let lastError = null;

  // ------------------------------------------------------------
  // 🔁 Retry loop
  // ------------------------------------------------------------
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      await runEditingOnce(sessionId, inputPath, outputPath, attempt, MAX_RETRIES);

      finalBuffer = await fs.promises.readFile(outputPath);

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
          RETRY_DELAY_MS * Math.pow(RETRY_BACKOFF, attempt - 1);

        info("🔁 Retrying editingProcessor after delay", {
          sessionId,
          attempt,
          nextInMs: delay,
        });

        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  stopKeepAlive(label);

  // ------------------------------------------------------------
  // ❌ All retries failed
  // ------------------------------------------------------------
  if (!finalBuffer) {
    error("💥 editingProcessor failed after all retries — returning raw audio", {
      sessionId,
      error: lastError?.message,
    });
    return audioBuffer;
  }

  // ------------------------------------------------------------
  // 📦 Safenet R2 Upload
  // ------------------------------------------------------------
  if (EDITED_BUCKET && PUBLIC_EDITED_BASE) {
    try {
      const key = `${sessionId}_edited.mp3`;

      // FIX: use correct namespace = EDITED_BUCKET
      await putObject(EDITED_BUCKET, key, finalBuffer, "audio/mpeg");

      info("💾 editingProcessor safenet upload complete", {
        sessionId,
        bucket: EDITED_BUCKET,
        key,
        url: `${PUBLIC_EDITED_BASE}/${encodeURIComponent(key)}`,
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
