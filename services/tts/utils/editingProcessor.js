import logger from "../service-logger.js";
const { info, warn, error, debug } = logger;
// 🎙️ REBUILT — STABLE EDITING PROCESSOR
// Crash-resistant multi-stage FFmpeg pipeline

import fs from "fs";
import path from "path";
import { spawn } from "child_process";
import { startKeepAlive, stopKeepAlive } from "#shared/keepalive.js";
import { uploadBuffer } from "#shared/r2-client.js";

const TMP_DIR = "/tmp/tts_editing";

// ------------------------------------------------------------
// Ensure tmp dir exists
// ------------------------------------------------------------
function ensureTmpDir() {
  if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR, { recursive: true });
}

// ------------------------------------------------------------
// Safe FFmpeg runner — validated, crash-resistant
// ------------------------------------------------------------
async function runStage({ sessionId, input, output, description, filter }) {
  log.info(`🎚️ ${description} — starting`, { sessionId });

  return new Promise((resolve, reject) => {
    const ff = spawn("ffmpeg", [
      "-hide_banner",
      "-loglevel", "error",
      "-i", input,
      "-af", filter,
      "-ar", "44100",
      "-codec:a", "libmp3lame",
      "-b:a", "192k",
      "-y",
      output,
    ]);

    let stderr = "";

    ff.stderr.on("data", d => (stderr += d.toString()));

    ff.on("close", code => {
      if (code !== 0) {
        return reject(
          new Error(`${description} failed (code ${code}): ${stderr}`)
        );
      }

      if (!fs.existsSync(output)) {
        return reject(new Error(`${description} produced no output`));
      }

      const s = fs.statSync(output);
      if (!s.size) {
        return reject(new Error(`${description} output empty`));
      }

      log.info(`✅ ${description} — completed`, {
        sessionId,
        size: s.size,
      });

      resolve(output);
    });
  });
}

// ------------------------------------------------------------
// REBUILT & SAFE PIPELINE
// ------------------------------------------------------------
export async function editingProcessor(sessionId, inputObj) {
  const keepAliveLabel = `editingProcessor:${sessionId}`;
  startKeepAlive(keepAliveLabel, 25000);

  ensureTmpDir();

  const inputPath = typeof inputObj === "string" ? inputObj : inputObj?.localPath;

  if (!inputPath || !fs.existsSync(inputPath)) {
    stopKeepAlive(keepAliveLabel);
    throw new Error(`Invalid or missing inputPath: ${inputPath}`);
  }

  const size = fs.statSync(inputPath).size;
  if (!size) {
    stopKeepAlive(keepAliveLabel);
    throw new Error(`Input file empty: ${inputPath}`);
  }

  log.info("🎚️ Editing Processor — starting", {
    sessionId,
    inputPath,
    size,
  });

  // Paths
  const p1 = path.join(TMP_DIR, `${sessionId}_stage1.mp3`);
  const p2 = path.join(TMP_DIR, `${sessionId}_stage2.mp3`);
  const p3 = path.join(TMP_DIR, `${sessionId}_stage3.mp3`);
  const p4 = path.join(TMP_DIR, `${sessionId}_stage4.mp3`);
  const p5 = path.join(TMP_DIR, `${sessionId}_stage5.mp3`);
  const pf = path.join(TMP_DIR, `${sessionId}_edited.mp3`);

  const allPaths = [p1, p2, p3, p4, p5, pf];
  allPaths.forEach(p => fs.existsSync(p) && fs.unlinkSync(p));

  let current = inputPath;
  let last = null;

  try {
    // ------------------------------------------------------------
    // STAGE 1 — Pitch warmth
    // ------------------------------------------------------------
    current = await runStage({
      sessionId,
      input: current,
      output: p1,
      description: "Stage 1: Pitch Warmth",
      filter: "rubberband=pitch=0.93:tempo=1.0"
    });
    last = p1;

    // ------------------------------------------------------------
    // STAGE 2 — Stable EQ (no plugin filters)
    // ------------------------------------------------------------
    const eq = [
      "highpass=f=75",                         // Removes rumble
      "equalizer=f=150:t=q:w=1.0:g=3.0",        // Warmth
      "equalizer=f=2200:t=q:w=1.5:g=1.4",       // Presence
      "equalizer=f=4000:t=q:w=1.2:g=1.2",       // Clarity
      "equalizer=f=6500:t=q:w=2.0:g=-2.0",      // De-harsh
      "lowpass=f=14000"                         // Smooth top
    ].join(",");

    current = await runStage({
      sessionId,
      input: current,
      output: p2,
      description: "Stage 2: EQ",
      filter: eq
    });
    last = p2;

    // ------------------------------------------------------------
    // STAGE 3 — Sibilance control (safe)
    // ------------------------------------------------------------
    current = await runStage({
      sessionId,
      input: current,
      output: p3,
      description: "Stage 3: De-Esser",
      filter: "deesser=i=0.4:m=0.8:f=0.55"
    });
    last = p3;

    // ------------------------------------------------------------
    // STAGE 4 — Broadcast dynamics (stable settings)
    // ------------------------------------------------------------
    const dynamics = [
      "acompressor=threshold=-20dB:ratio=3:attack=12:release=200:makeup=2",
      "alimiter=limit=0.97:attack=5:release=100",
    ].join(",");

    current = await runStage({
      sessionId,
      input: current,
      output: p4,
      description: "Stage 4: Dynamics",
      filter: dynamics
    });
    last = p4;

    // ------------------------------------------------------------
    // STAGE 5 — Stereo enhancement with fallback
    // ------------------------------------------------------------
    let stereoFilter = "earwax"; // primary

    current = await runStage({
      sessionId,
      input: current,
      output: p5,
      description: "Stage 5: Stereo Enhancement",
      filter: stereoFilter
    }).catch(async () => {
      stereoFilter = "pan=stereo|c0=c0|c1=c0"; // safe fallback
      log.warn("⚠️ Earwax unavailable — using fallback stereo pan", { sessionId });

      return await runStage({
        sessionId,
        input: current,
        output: p5,
        description: "Stage 5: Stereo Enhancement (Fallback)",
        filter: stereoFilter
      });
    });

    last = p5;

    // ------------------------------------------------------------
    // FINALIZE
    // ------------------------------------------------------------
    fs.copyFileSync(p5, pf);
    const finalBuffer = fs.readFileSync(pf);

    await uploadBuffer("editedAudio", `${sessionId}_edited.mp3`, finalBuffer, "audio/mpeg");

    log.info("💾 Upload complete — edited MP3 stored", {
      sessionId,
      size: finalBuffer.length,
    });

    stopKeepAlive(keepAliveLabel);
    return finalBuffer;

  } catch (err) {
    log.error("💥 Editing failure", { sessionId, error: err.message });

    const fallback = last ? fs.readFileSync(last) : fs.readFileSync(inputPath);

    await uploadBuffer("editedAudio", `${sessionId}_edited.mp3`, fallback, "audio/mpeg");

    log.warn("⚠️ Using fallback audio", {
      sessionId,
      lastStage: last || "input",
      size: fallback.length
    });

    stopKeepAlive(keepAliveLabel);
    return fallback;

  } finally {
    allPaths.forEach(p => {
      if (p !== pf && fs.existsSync(p)) {
        try {
          fs.unlinkSync(p);
          log.info("🧹 Cleaned temp file", { sessionId, p });
        } catch {}
      }
    });
  }
}

export default editingProcessor;
