// ============================================================  
// 🎚️ Editing Processor — Hybrid Mastering (Stage 1)  
// ============================================================  
//
// Now uses the merged MP3 from R2 (MERGED bucket) as the input:
//   • Input:  R2_PUBLIC_BASE_URL_MERGE/<sessionId>.mp3  → streamed by ffmpeg
//   • Output: Edited MP3 written to /tmp/edited_audio/<sessionId>_edited.mp3
//
// Features:
//   • Local retry logic around ffmpeg
//   • Keep-alive signals
//   • Safenet upload to R2_BUCKET_EDITED_AUDIO
//   • On total failure, returns original merged MP3 from MERGED URL
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

// Public URL base for merged audio (input)
const MERGED_BASE =
  process.env.R2_PUBLIC_BASE_URL_MERGE || "";

// Edited-audio bucket + public base (output)
const EDITED_BUCKET =
  process.env.R2_BUCKET_EDITED_AUDIO || "";
const PUBLIC_EDITED_BASE =
  process.env.R2_PUBLIC_BASE_URL_EDITED_AUDIO || "";

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
//   inputSource can be an HTTP URL or a local path
// ------------------------------------------------------------
function runEditingOnce(
  sessionId,
  inputSource,
  outputPath,
  attempt,
  total
) {
  const filters = ffmpegStage1Filter();

  const args = [
    "-y",
    "-i",
    inputSource,
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
      else reject(
        new Error(`ffmpeg exited with code ${code}: ${stderr}`)
      );
    });
  });
}

// ------------------------------------------------------------
// 🛰️ Fallback: fetch merged MP3 from R2 as Buffer
// ------------------------------------------------------------
async function fetchMergedBuffer(sessionId, mergedUrl) {
  const fetchFn = globalThis.fetch;
  if (!fetchFn) {
    throw new Error(
      "fetch is not available in this runtime; cannot download merged MP3 fallback"
    );
  }

  const res = await fetchFn(mergedUrl);
  if (!res.ok) {
    throw new Error(
      `Failed to fetch merged MP3 fallback: HTTP ${res.status}`
    );
  }

  const arrayBuffer = await res.arrayBuffer();
  const buf = Buffer.from(arrayBuffer);

  if (buf.length < 1000) {
    throw new Error(
      `Merged MP3 fallback from R2 is too small or invalid (bytes=${buf.length})`
    );
  }

  return buf;
}

// ------------------------------------------------------------
// 🎧 editingProcessor — Main
// ------------------------------------------------------------
// NOTE: second parameter is accepted but IGNORED so orchestrator
//       does not have to be changed right now.
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
    sessionId + ".mp3"
  )}`;
  const outputPath = path.join(
    TMP_DIR,
    `${sessionId}_edited.mp3`
  );

  info("🔗 Using merged MP3 as editing input", {
    sessionId,
    mergedUrl,
    outputPath,
  });

  let finalBuffer = null;
  let lastError = null;

  // ------------------------------------------------------------
  // 🔁 Retry loop around ffmpeg
  // ------------------------------------------------------------
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      // Ensure any stale output is removed
      try {
        await fs.promises.unlink(outputPath);
      } catch {
        // ignore if it doesn't exist
      }

      await runEditingOnce(
        sessionId,
        mergedUrl,
        outputPath,
        attempt,
        MAX_RETRIES
      );

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

  // Clean up temp output file (best-effort)
  try {
    await fs.promises.unlink(outputPath);
  } catch {
    // ignore
  }

  // ------------------------------------------------------------
  // ❌ All retries failed → fall back to original merged MP3
  // ------------------------------------------------------------
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
        sessionId,
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
      // At this point we genuinely cannot recover
      throw lastError || fallbackErr;
    }
  }

  // ------------------------------------------------------------
  // 📦 Safenet R2 Upload
  // ------------------------------------------------------------
  if (EDITED_BUCKET && PUBLIC_EDITED_BASE) {
    try {
      const key = `${sessionId}_edited.mp3`;

      await putObject(
        EDITED_BUCKET,
        key,
        finalBuffer,
        "audio/mpeg"
      );

      info("💾 editingProcessor safenet upload complete", {
        sessionId,
        bucket: EDITED_BUCKET,
        key,
        url: `${PUBLIC_EDITED_BASE}/${encodeURIComponent(
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
