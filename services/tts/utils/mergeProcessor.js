// ============================================================
// 🎧 TTS Merge Processor — Combine all chunk files into one MP3
// ============================================================

import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import { log } from "#logger.js";
import { R2_BUCKETS, getObjectAsText, uploadBuffer } from "#shared/r2-client.js";

// ------------------------------------------------------------
// 🧠 Helper: Local temp directory for merge operations
// ------------------------------------------------------------
const TMP_DIR = "/tmp/podcast_merge";

function ensureTmpDir() {
  if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR, { recursive: true });
  return TMP_DIR;
}

// ------------------------------------------------------------
// 🧩 Merge TTS Chunks
// ------------------------------------------------------------
export async function mergeProcessor(sessionId, chunkFiles = []) {
  ensureTmpDir();

  log.info({ sessionId }, "🎧 Starting mergeProcessor");

  try {
    // If chunkFiles not provided, list from R2 raw bucket
    if (!chunkFiles || !chunkFiles.length) {
      log.info({ sessionId }, "🔍 No chunk list passed — expecting orchestrator to supply it.");
      throw new Error("mergeProcessor requires chunk list from TTS step.");
    }

    const concatListPath = path.join(TMP_DIR, `${sessionId}_list.txt`);
    const outputFile = path.join(TMP_DIR, `${sessionId}_merged.mp3`);

    // Write ffmpeg concat list
    fs.writeFileSync(
      concatListPath,
      chunkFiles.map((f) => `file '${f}'`).join("\n"),
      "utf8"
    );

    // Merge using ffmpeg
    execSync(`ffmpeg -y -f concat -safe 0 -i ${concatListPath} -c copy ${outputFile}`, {
      stdio: "ignore",
    });

    const mergedBuffer = fs.readFileSync(outputFile);
    const key = `${sessionId}_merged.mp3`;

    // Upload to R2 merged bucket
    await uploadBuffer("merged", key, mergedBuffer, "audio/mpeg");
    log.info({ sessionId, key }, "💾 Uploaded merged MP3 to R2");

    return outputFile;
  } catch (err) {
    log.error({ sessionId, error: err.message }, "💥 mergeProcessor failed");
    throw err;
  }
  }
