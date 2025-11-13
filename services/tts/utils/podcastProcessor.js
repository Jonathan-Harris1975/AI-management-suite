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
  log.info("🎵 Starting podcastProcessor", { sessionId });

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

    // Join with fades
    const fadeComplex =
      "[0:a]afade=t=in:ss=0:d=3[a0];" +
      "[2:a]afade=t=out:st=0:d=3[a2];" +
      "[a0][1:a][a2]concat=n=3:v=0:a=1[aout]";

    execSync(
      `ffmpeg -y -i ${intro} -i ${mainAudioPath} -i ${outro} -filter_complex "${fadeComplex}" -map "[aout]" ${preMaster}`,
      { stdio: "ignore" }
    );

    // Apply final mastering filters
    const filterStr = masterFilters.join(",");
    execSync(`ffmpeg -y -i ${preMaster} -af "${filterStr}" -ar 44100 -b:a 192k ${finalFile}`, {
      stdio: "ignore",
    });

    // Upload to R2
    const buffer = fs.readFileSync(finalFile);
    const key = `${sessionId}_final.mp3`;
    await uploadBuffer("podcast", key, buffer, "audio/mpeg");

    log.info("💾 Uploaded final mastered podcast MP3 to R2", { sessionId, key });
    stopKeepAlive();
    return finalFile;
  } catch (err) {
    log.error("💥 podcastProcessor failed", { sessionId, error: err.message });
    stopKeepAlive();
    throw err;
  }
       }
