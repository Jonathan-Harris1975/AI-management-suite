import {s3, R2_BUCKETS, uploadBuffer, listKeys, getObjectAsText} from "../../shared/utils/r2-client.js";
// utils/mergeProcessor.js
import fs from "fs";
import path from "path";
import { spawn } from "child_process";
import fetch from "node-fetch";
import { validateEnv } from "../services/env-checker.js";
validateEnv();          // hard-stop if any env var is missing
// single HeadBucket probe (no retries/ping)
import logger from "./logger.js";

const tempDir = "/tmp"; // Render ephemeral storage

/**
 * Merge raw TTS chunks into a single MP3
 */
export async function mergeChunks(sessionId) {
  try {
    const sessionDir = path.join(tempDir, sessionId);
    if (!fs.existsSync(sessionDir)) {
      fs.mkdirSync(sessionDir);
    }

    logger.info(`🎼 Starting merge for session=${sessionId}`);

    // 1. List raw chunks from R2 - use listChunks from TTSr2 which queries the raw bucket
    const chunkKeys = await listChunks(sessionId); // Just pass sessionId, not prefix
    if (!chunkKeys || chunkKeys.length === 0) {
      throw new Error(`No raw chunks found in R2 for session=${sessionId}`);
    }

    const chunkFiles = [];
    for (const key of chunkKeys.sort()) {
      if (key.endsWith(".mp3")) {
        const chunkPath = path.join(sessionDir, path.basename(key));
        const fileUrl = `${process.env.R2_PUBLIC_BASE_URL_RAW}/${key}`;

        logger.debug(`⬇️ Downloading chunk: ${fileUrl}`);
        const res = await fetch(fileUrl);
        if (!res.ok) throw new Error(`Failed to fetch ${fileUrl}: ${res.status} ${res.statusText}`);

        const fileStream = fs.createWriteStream(chunkPath);
        await new Promise((resolve, reject) => {
          res.body.pipe(fileStream);
          res.body.on("error", reject);
          fileStream.on("finish", resolve);
        });

        chunkFiles.push(chunkPath);
      }
    }

    if (chunkFiles.length === 0) {
      throw new Error(`No valid .mp3 raw chunks found for session=${sessionId}`);
    }

    logger.info(`⬇️ Downloaded ${chunkFiles.length} raw chunks for session=${sessionId}`);

    // 2. Build concat list for ffmpeg
    const listFilePath = path.join(sessionDir, "list.txt");
    fs.writeFileSync(
      listFilePath,
      chunkFiles.map((f) => `file '${f}'`).join("\n")
    );

    // 3. Merge into single MP3
    const mergedFile = path.join(sessionDir, `${sessionId}_merged.mp3`);
    await new Promise((resolve, reject) => {
      const ffmpeg = spawn("ffmpeg", [
        "-f", "concat",
        "-safe", "0",
        "-i", listFilePath,
        "-c", "copy",
        mergedFile,
      ]);

      ffmpeg.stderr.on("data", (data) => logger.debug(`ffmpeg merge: ${data}`));
      ffmpeg.on("close", (code) => {
        if (code === 0) {
          logger.info(`🔗 ffmpeg merge completed for session=${sessionId}`);
          resolve();
        } else {
          reject(new Error(`ffmpeg merge failed with exit code ${code}`));
        }
      });
    });

    // 4. Upload merged file back to merged bucket
    const r2Key = `${sessionId}-merged.mp3`;
    const finalUrl = await uploadMergedFile(mergedFile, r2Key); // ✅ Correct order: local path first, then key

    logger.info(`✅ Merged file uploaded for session=${sessionId} at ${finalUrl}`);
    return finalUrl;
  } catch (err) {
    logger.error(`💥 Error merging chunks for session=${sessionId}: ${err.stack || err.message}`);
    throw err;
  }
}
