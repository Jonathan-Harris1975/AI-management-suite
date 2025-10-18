import {s3, R2_BUCKETS, uploadBuffer, listKeys, getObjectAsText} from "../../shared/utils/r2-client.js";
import fs from "fs";
import path from "path";
import os from "os";
import { spawn } from "child_process";
import fetch from "node-fetch";
import { validateEnv } from "../services/env-checker.js";
validateEnv();          // hard-stop if any env var is missing
// single HeadBucket probe (no retries/ping)
import logger from "./logger.js";

const tempDir = os.tmpdir();

/**
 * Download a remote file to /tmp
 */
async function downloadFile(url, destPath) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.statusText}`);
  const fileStream = fs.createWriteStream(destPath);
  await new Promise((resolve, reject) => {
    res.body.pipe(fileStream);
    res.body.on("error", reject);
    fileStream.on("finish", resolve);
  });
}

/**
 * Build the final podcast:
 *   intro (fade in) + edited main + outro (fade out)
 */
export async function processPodcast(sessionId, editedPath) {
  try {
    logger.info(`🎙️ Building podcast for ${sessionId}`);

    const introPath = path.join(tempDir, `${sessionId}-intro.mp3`);
    const outroPath = path.join(tempDir, `${sessionId}-outro.mp3`);
    const finalPath = path.join(tempDir, `${sessionId}-podcast.mp3`);

    // 1. Download intro + outro from env URLs
    await downloadFile(process.env.PODCAST_INTRO_URL, introPath);
    await downloadFile(process.env.PODCAST_OUTRO_URL, outroPath);

    // 2. Apply fade effects and concat
    await runFFmpegConcat(introPath, editedPath, outroPath, finalPath);

    // 3. Upload final podcast to R2
    const r2Key = await uploadPodcastToR2(sessionId, finalPath);

    logger.info(`✅ Podcast complete for ${sessionId}: ${r2Key}`);
    return {
      sessionId,
      fileKey: r2Key,
      status: "podcast-ready",
    };
  } catch (err) {
    logger.error(`❌ Podcast creation failed for ${sessionId}: ${err.message}`);
    throw err;
  }
}

/**
 * Run ffmpeg to fade intro/outro and concat all together
 */
function runFFmpegConcat(introPath, mainPath, outroPath, outputPath) {
  return new Promise((resolve, reject) => {
    // Complex filter: fade intro in over 15s, fade outro out over 15s
    const ffmpeg = spawn("ffmpeg", [
      "-y",
      "-i", introPath,
      "-i", mainPath,
      "-i", outroPath,
      "-filter_complex",
      `
      [0:a]afade=t=in:ss=0:d=15[intro];
      [2:a]afade=t=out:st=0:d=15[outro];
      [intro][1:a][outro]concat=n=3:v=0:a=1[a]
      `,
      "-map", "[a]",
      "-ar", "44100",
      "-b:a", "192k",
      outputPath,
    ]);

    ffmpeg.stderr.on("data", (data) => {
      logger.info(`FFmpeg: ${data}`);
    });

    ffmpeg.on("close", (code) => {
      if (code === 0) resolve(outputPath);
      else reject(new Error(`FFmpeg exited with code ${code}`));
    });
  });
}
