// ============================================================
// 🎚️ Editing Processor — Apply Audio Enhancements & Mastering
// ============================================================

import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import { log } from "#logger.js";
import { startHeartbeat, stopHeartbeat } from "#shared/heartbeat.js";
import { uploadBuffer } from "#shared/r2-client.js";

// ------------------------------------------------------------
// 🧠 Setup
// ------------------------------------------------------------
const TMP_DIR = "/tmp/tts_editing";

function ensureTmpDir() {
  if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR, { recursive: true });
  return TMP_DIR;
}

// ------------------------------------------------------------
// 🎛️ Audio Enhancement Filters (Warm + Clean + Controlled)
// ------------------------------------------------------------
const filters = [
  // Stage 1: Clean noise, shape tone, and balance frequencies
  "highpass=f=100,lowpass=f=10000,afftdn=nr=10:tn=1,firequalizer=gain_entry='entry(150,3);entry(2500,2)',deesser=f=7000:i=0.7,acompressor=threshold=-24dB:ratio=4:attack=10:release=200:makeup=5,dynaudnorm=f=100:n=0:p=0.9,aresample=44100,aconvolution=reverb=0.1:0.1:0.9:0.9",

  // Stage 2: Gentle tonal lift (warmth and brightness)
  "equalizer=f=120:width_type=o:width=2:g=3",

  // Stage 3: Presence boost for clarity
  "equalizer=f=9000:width_type=o:width=2:g=2",
];

// ------------------------------------------------------------
// 🧩 Main Processor
// ------------------------------------------------------------
export async function editingProcessor(sessionId, inputPath) {
  startHeartbeat(`editingProcessor:${sessionId}`, 25000);
  
  startHeartbeat(`editingProcessor:${sessionId}`, 25000);
  ensureTmpDir();
  log.info({ sessionId }, "🎚️ Starting editingProcessor");

  try {
    const editedFile = path.join(TMP_DIR, `${sessionId}_edited.mp3`);
    const filterStr = filters.join(",");

    // Run FFmpeg with the advanced audio filter chain
    execSync(`ffmpeg -y -i ${inputPath} -af "${filterStr}" -ar 44100 -b:a 192k ${editedFile}`, {
      stdio: "ignore",
    });

    // Upload to R2
    const buffer = fs.readFileSync(editedFile);
    const key = `${sessionId}_edited.mp3`;
    await uploadBuffer("merged", key, buffer, "audio/mpeg");

    log.info({ sessionId, key }, "💾 Uploaded edited MP3 to R2");
    return editedFile;
  } catch (err) {
    log.error({ sessionId, error: err.message }, "💥 editingProcessor failed");
    stopHeartbeat();
    stopHeartbeat();
    throw err;
  }
}
