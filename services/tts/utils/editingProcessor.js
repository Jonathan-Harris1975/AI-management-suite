// ============================================================  
// 🎚️ Editing Processor — Hybrid Mastering (Stage 1)  
// ============================================================  
//
// Stage 1 now performs ONLY:
//   • High-pass cleanup (110 Hz)
//   • Anti-robotic EQ notch using ffmpeg-native filter
//   • Light compressor
//
// loudnorm is REMOVED because you apply it in podcastProcessor later.
//
// Still uses merged MP3 from R2.  
//
// ============================================================  

import fs from "fs";
import path from "path";
import { spawn } from "child_process";
import { info, warn, error } from "#logger.js";
import { startKeepAlive, stopKeepAlive } from "#shared/keepalive.js";
import { putObject } from "#shared/r2-client.js";

// --------------------------- ENV ----------------------------
const TMP_DIR = "/tmp/edited_audio";

const MAX_RETRIES = Number(process.env.MAX_EDIT_RETRIES || process.env.MAX_CHUNK_RETRIES || 3);
const RETRY_DELAY_MS = Number(process.env.EDIT_RETRY_DELAY_MS || process.env.RETRY_DELAY_MS || 2000);
const RETRY_BACKOFF = Number(process.env.RETRY_BACKOFF_MULTIPLIER || 2);

const MERGED_BASE = process.env.R2_PUBLIC_BASE_URL_MERGE || "";
const EDITED_BUCKET = process.env.R2_BUCKET_EDITED_AUDIO || "";
const PUBLIC_EDITED_BASE = process.env.R2_PUBLIC_BASE_URL_EDITED_AUDIO || "";

// ensure folder exists
if (!fs.existsSync(TMP_DIR)) {
  fs.mkdirSync(TMP_DIR, { recursive: true });
}

// ------------------ Stage 1 Filter Chain --------------------
function ffmpegStage1Filter() {
  return [
    "highpass=f=110",

    // FIX: anequalizer is NOT available in Debian ffmpeg → use equalizer
    "equalizer=f=7000:t=h:w=200:g=-6",

    // Light softening compression
    "acompressor=threshold=-20dB:ratio=2:attack=10:release=80"
  ].join(",");
}

// ---------------------- ffmpeg runner -----------------------
function runEditingOnce(sessionId, inputSource, outputPath, attempt, total) {
  const filters = ffmpegStage1Filter();

  const args = [
    "-y",
    "-i", inputSource,
    "-filter:a", filters,
    "-c:a", "libmp3lame",
    "-b:a", "128k",
    outputPath
  ];

  return new Promise((resolve, reject) => {
    info("🎚️ Starting editingProcessor ffmpeg attempt", {
      sessionId, attempt, total, args
    });

    const ff = spawn("ffmpeg", args);
    let stderr = "";

    ff.stderr.on("data", (buf) => {
      const txt = buf.toString();
      stderr += txt;
      if (txt.toLowerCase().includes("error")) {
        warn("⚠️ ffmpeg stderr (editingProcessor)", {
          sessionId, attempt, stderr: txt
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

// --------------- fallback downloader for merged -------------
async function fetchMergedBuffer(sessionId, mergedUrl) {
  const fetchFn = globalThis.fetch;
  if (!fetchFn) throw new Error("fetch missing in runtime.");

  const res = await fetchFn(mergedUrl);
  if (!res.ok) throw new Error(`Failed to fetch fallback MP3: HTTP ${res.status}`);

  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 1000) throw new Error(`Fallback MP3 too small (bytes=${buf.length})`);
  return buf;
}

// ---------------------- editingProcessor --------------------
export async function editingProcessor(sessionId) {
  const label = `editingProcessor:${sessionId}`;
  startKeepAlive(label, 15000);

  if (!MERGED_BASE) {
    stopKeepAlive(label);
    throw new Error("R2_PUBLIC_BASE_URL_MERGE not set");
  }

  const mergedUrl = `${MERGED_BASE}/${encodeURIComponent(sessionId + ".mp3")}`;
  const outputPath = path.join(TMP_DIR, `${sessionId}_edited.mp3`);

  info("🔗 Using merged MP3 as editing input", { sessionId, mergedUrl, outputPath });

  let finalBuffer = null;
  let lastError = null;

  // ---- retry loop ----
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      try { await fs.promises.unlink(outputPath); } catch {}

      await runEditingOnce(sessionId, mergedUrl, outputPath, attempt, MAX_RETRIES);

      finalBuffer = await fs.promises.readFile(outputPath);

      info("✅ editingProcessor produced cleaned audio", {
        sessionId, bytes: finalBuffer.length, attempt
      });

      break;
    } catch (err) {
      lastError = err;

      warn("⚠️ editingProcessor attempt failed", {
        sessionId, attempt, error: err.message, maxAttempts: MAX_RETRIES
      });

      if (attempt < MAX_RETRIES) {
        const delay = RETRY_DELAY_MS * Math.pow(RETRY_BACKOFF, attempt - 1);
        info("🔁 Retrying after delay", { sessionId, attempt, nextInMs: delay });
        await new Promise(r => setTimeout(r, delay));
      }
    }
  }

  stopKeepAlive(label);

  // cleanup temp file
  try { await fs.promises.unlink(outputPath); } catch {}

  // ---- all attempts failed → return original merged ----
  if (!finalBuffer) {
    error("💥 editingProcessor failed — falling back to merged MP3", {
      sessionId, error: lastError?.message
    });

    const fallback = await fetchMergedBuffer(sessionId, mergedUrl);

    info("🛟 Returned merged MP3 as fallback", {
      sessionId, bytes: fallback.length
    });

    return fallback;
  }

  // ---- safenet upload ----
  if (EDITED_BUCKET && PUBLIC_EDITED_BASE) {
    try {
      const key = `${sessionId}_edited.mp3`;
      await putObject(EDITED_BUCKET, key, finalBuffer, "audio/mpeg");

      info("💾 Safenet edited upload complete", {
        sessionId,
        bucket: EDITED_BUCKET,
        key,
        url: `${PUBLIC_EDITED_BASE}/${encodeURIComponent(key)}`
      });

    } catch (err) {
      warn("⚠️ Safenet upload failed", { sessionId, error: err.message });
    }
  }

  return finalBuffer;
}

export default editingProcessor;
