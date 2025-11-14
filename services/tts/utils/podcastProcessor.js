// ============================================================
// 🎵 Podcast Processor — Add Intro/Outro & Final Mastering
// ============================================================

import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import { log } from "#logger.js";
import { uploadBuffer } from "#shared/r2-client.js";
import { startKeepAlive, stopKeepAlive } from "#shared/keepalive.js";

const TMP_DIR = "/tmp/podcast_final";

// Environment variables with defaults
const MIN_INTRO_DURATION = parseFloat(process.env.MIN_INTRO_DURATION) || 0.30; // 30 seconds
const MIN_OUTRO_DURATION = parseFloat(process.env.MIN_OUTRO_DURATION) || 0.30; // 30 seconds

function ensureTmpDir() {
  if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR, { recursive: true });
  return TMP_DIR;
}

// 🎚️ Mastering filters — light version for full mix
const masterFilters = [
  "acompressor=threshold=-18dB:ratio=2:attack=20:release=250:makeup=4",
  "dynaudnorm=f=200:n=1:p=0.7",
  "equalizer=f=150:width_type=o:width=2:g=1.5",
  "equalizer=f=8000:width_type=o:width=2:g=1.5",
  "aecho=0.8:0.88:60:0.2,asetrate=44100,aresample=44100",
];

export async function podcastProcessor(sessionId, mainAudioPath) {
  startKeepAlive(`podcastProcessor:${sessionId}`, 25000);
  ensureTmpDir();
  
  log.info("🎵 Starting podcastProcessor", { 
    sessionId, 
    minIntroDuration: MIN_INTRO_DURATION, 
    minOutroDuration: MIN_OUTRO_DURATION 
  });

  try {
    const introUrl = process.env.PODCAST_INTRO_URL;
    const outroUrl = process.env.PODCAST_OUTRO_URL;
    const intro = path.join(TMP_DIR, `${sessionId}_intro.mp3`);
    const outro = path.join(TMP_DIR, `${sessionId}_outro.mp3`);

    // Download intro/outro
    fs.writeFileSync(intro, Buffer.from(await (await fetch(introUrl)).arrayBuffer()));
    fs.writeFileSync(outro, Buffer.from(await (await fetch(outroUrl)).arrayBuffer()));

    const preMaster = path.join(TMP_DIR, `${sessionId}_premaster.mp3`);
    const finalFile = path.join(TMP_DIR, `${sessionId}_final.mp3`);

    // Get audio durations
    const getDuration = (filePath) => {
      const result = execSync(
        `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${filePath}"`
      ).toString().trim();
      return parseFloat(result);
    };

    const introDuration = getDuration(intro);
    const outroDuration = getDuration(outro);
    const mainDuration = getDuration(mainAudioPath);

    log.info("📊 Audio durations", {
      sessionId,
      introDuration: introDuration.toFixed(2),
      outroDuration: outroDuration.toFixed(2),
      mainDuration: mainDuration.toFixed(2),
      requiredIntro: MIN_INTRO_DURATION,
      requiredOutro: MIN_OUTRO_DURATION
    });

    // Validate minimum durations
    if (introDuration < MIN_INTRO_DURATION) {
      log.warn("⚠️ Intro is shorter than required minimum", {
        sessionId,
        current: introDuration,
        required: MIN_INTRO_DURATION
      });
    }

    if (outroDuration < MIN_OUTRO_DURATION) {
      log.warn("⚠️ Outro is shorter than required minimum", {
        sessionId,
        current: outroDuration,
        required: MIN_OUTRO_DURATION
      });
    }

    // Calculate fade points based on actual durations
    const introFadeIn = Math.min(3, introDuration * 0.1); // 3s or 10% of intro
    const outroFadeOut = Math.min(3, outroDuration * 0.1); // 3s or 10% of outro
    
    // Main content fades
    const mainFadeIn = Math.min(2, mainDuration * 0.05); // 2s or 5% of main content
    const mainFadeOut = Math.min(2, mainDuration * 0.05); // 2s or 5% of main content

    // Complex filter for joining with proper fades
    const fadeComplex =
      `[0:a]afade=t=in:st=0:d=${introFadeIn}[a0];` +
      `[1:a]afade=t=in:st=0:d=${mainFadeIn},afade=t=out:st=${mainDuration - mainFadeOut}:d=${mainFadeOut}[a1];` +
      `[2:a]afade=t=out:st=${outroDuration - outroFadeOut}:d=${outroFadeOut}[a2];` +
      `[a0][a1][a2]concat=n=3:v=0:a=1[aout]`;

    execSync(
      `ffmpeg -y -i "${intro}" -i "${mainAudioPath}" -i "${outro}" -filter_complex "${fadeComplex}" -map "[aout]" "${preMaster}"`,
      { stdio: "ignore" }
    );

    // Apply final mastering filters
    const filterStr = masterFilters.join(",");
    execSync(`ffmpeg -y -i "${preMaster}" -af "${filterStr}" -ar 44100 -b:a 192k "${finalFile}"`, {
      stdio: "ignore",
    });

    // Verify final duration
    const finalDuration = getDuration(finalFile);
    const expectedDuration = introDuration + mainDuration + outroDuration;
    
    log.info("✅ Final audio composition", {
      sessionId,
      finalDuration: finalDuration.toFixed(2),
      expectedDuration: expectedDuration.toFixed(2),
      totalFadeTime: (introFadeIn + mainFadeIn + mainFadeOut + outroFadeOut).toFixed(2)
    });

    // Upload to R2
    const buffer = fs.readFileSync(finalFile);
    const key = `${sessionId}.mp3`;
    await uploadBuffer("podcast", key, buffer, "audio/mpeg");

    log.info("💾 Uploaded final mastered podcast MP3 to R2", { 
      sessionId, 
      key,
      finalSize: buffer.length,
      finalDuration: finalDuration.toFixed(2)
    });
    
    stopKeepAlive();
    return finalFile;
  } catch (err) {
    log.error("💥 podcastProcessor failed", { sessionId, error: err.message });
    stopKeepAlive();
    throw err;
  }
      } 
