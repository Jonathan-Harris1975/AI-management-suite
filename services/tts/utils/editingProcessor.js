import {s3, R2_BUCKETS, uploadBuffer, listKeys, getObjectAsText} from "../../shared/utils/r2-client.js";
import path from "path";
import os from "os";
import { spawn } from "child_process";
import { validateEnv } from "../services/env-checker.js";
validateEnv();          // hard-stop if any env var is missing
// single HeadBucket probe (no retries/ping)
import logger from "./logger.js";

const tempDir = os.tmpdir();

async function processEditing(sessionId) {
  const outputPath = path.join(tempDir, `${sessionId}-edited.mp3`);

  try {
    logger.info(`🎧 Starting streaming audio processing for ${sessionId}`);
    
    // Stream directly from R2 to ffmpeg
    await streamFromR2ToFfmpeg(sessionId, outputPath);

    logger.info(`✨ Audio effects applied successfully for ${sessionId}`);

    return {
      sessionId,
      localPath: outputPath,
      status: "edited",
    };
  } catch (err) {
    logger.error(`❌ Editing failed for ${sessionId}: ${err.message}`);
    logger.error(`🔍 Error details: ${err.stack}`);
    throw err;
  }
}

async function streamFromR2ToFfmpeg(sessionId, outputFile) {
  return new Promise(async (resolve, reject) => {
    try {
      const fileName = `${sessionId}-merged.mp3`;
      logger.info(`📦 Creating read stream from R2 for: ${fileName}`);
      
      // Get a readable stream from R2
      const readStream = await getR2ReadStream(fileName);
      
      const filters = [
        
        "equalizer=f=120:width_type=o:width=2:g=3",
        "equalizer=f=9000:width_type=o:width=2:g=2"
        
      ];

      logger.info(`🔧 Starting FFmpeg with filters: ${filters.join(', ')}`);

      const ffmpeg = spawn("ffmpeg", [
        "-y",
        "-i", "pipe:0", // Read from stdin
        "-af", filters.join(","),
        "-ar", "44100",
        "-ac", "2",
        "-b:a", "192k",
        outputFile,
      ]);

      // Pipe R2 stream to ffmpeg stdin
      readStream.pipe(ffmpeg.stdin);

      let stderrData = '';

      ffmpeg.stderr.on("data", (data) => {
        const dataStr = data.toString();
        stderrData += dataStr;
        // Log FFmpeg progress
        if (dataStr.includes('time=') || dataStr.includes('size=')) {
          logger.info(`FFmpeg: ${dataStr.trim()}`);
        }
      });

      readStream.on("error", (err) => {
        logger.error(`❌ R2 stream error: ${err.message}`);
        reject(new Error(`R2 stream error: ${err.message}`));
      });

      ffmpeg.on("error", (err) => {
        logger.error(`❌ FFmpeg spawn error: ${err.message}`);
        reject(new Error(`FFmpeg spawn error: ${err.message}`));
      });

      ffmpeg.on("close", (code) => {
        if (code === 0) {
          logger.info(`✅ FFmpeg completed successfully`);
          resolve(outputFile);
        } else {
          logger.error(`❌ FFmpeg exited with code ${code}`);
          logger.error(`🔍 FFmpeg stderr: ${stderrData}`);
          reject(new Error(`FFmpeg exited with code ${code}: ${stderrData.substring(0, 200)}...`));
        }
      });

    } catch (err) {
      logger.error(`❌ Failed to create R2 stream: ${err.message}`);
      reject(err);
    }
  });
}

export { processEditing };
