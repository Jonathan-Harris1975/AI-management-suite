// ============================================================
// 🎵 Podcast Processor — Add Intro/Outro & Fades
// ============================================================

import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import { log } from "#logger.js";
import { uploadBuffer } from "#shared/r2-client.js";

const TMP_DIR = "/tmp/podcast_final";

function ensureTmpDir() {
  if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR, { recursive: true });
  return TMP_DIR;
}

export async function podcastProcessor(sessionId, mainAudioPath) {
  ensureTmpDir();
  log.info({ sessionId }, "🎵 Starting podcastProcessor");

  try {
    const introUrl = process.env.PODCAST_INTRO_URL;
    const outroUrl = process.env.PODCAST_OUTRO_URL;
    const intro = path.join(TMP_DIR, `${sessionId}_intro.mp3`);
    const outro = path.join(TMP_DIR, `${sessionId}_outro.mp3`);

    // Download intro/outro from R2 public URLs
    fs.writeFileSync(intro, Buffer.from(await (await fetch(introUrl)).arrayBuffer()));
    fs.writeFileSync(outro, Buffer.from(await (await fetch(outroUrl)).arrayBuffer()));

    const finalFile = path.join(TMP_DIR, `${sessionId}_final.mp3`);

    const filterComplex =
      "[0:a]afade=t=in:ss=0:d=3[a0];" + // fade-in
      "[2:a]afade=t=out:st=0:d=3[a2];" + // fade-out
      "[a0][1:a][a2]concat=n=3:v=0:a=1[aout]";

    execSync(
      `ffmpeg -y -i ${intro} -i ${mainAudioPath} -i ${outro} -filter_complex "${filterComplex}" -map "[aout]" ${finalFile}`,
      { stdio: "ignore" }
    );

    const buffer = fs.readFileSync(finalFile);
    const key = `${sessionId}_final.mp3`;
    await uploadBuffer("podcast", key, buffer, "audio/mpeg");

    log.info({ sessionId, key }, "💾 Uploaded final podcast MP3 to R2");
    return finalFile;
  } catch (err) {
    log.error({ sessionId, error: err.message }, "💥 podcastProcessor failed");
    throw err;
  }
                       }
