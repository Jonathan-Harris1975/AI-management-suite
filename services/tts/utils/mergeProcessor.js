// services/tts/utils/mergeProcessor.js
// ============================================================
// 🎧 mergeProcessor — Static FFmpeg Version (Production Safe)
// ============================================================
//
// ✅ Uses ffmpeg-static (no system dependency)
// ✅ Merges remote/public .mp3 chunks into one final file
// ✅ Uploads merged file to R2_BUCKET_MERGED
// ✅ Compatible with Shiper’s environment
// ============================================================

import fs from "fs";
import path from "path";
import os from "os";
import { promisify } from "util";
import { exec } from "child_process";
import ffmpegPath from "ffmpeg-static";
import { info, error } from "#logger.js";
import { putObject } from "#shared/r2-client.js";

const execAsync = promisify(exec);

// ------------------------------------------------------------
// ⚙️ Config
// ------------------------------------------------------------
const TMP_DIR = path.join(os.tmpdir(), "podcast_merge");
const R2_BUCKET_MERGED = process.env.R2_BUCKET_MERGED || "podcast-merged";

// ------------------------------------------------------------
// 🧩 Helper
// ------------------------------------------------------------
function safeFilename(name) {
  return name.replace(/[^a-zA-Z0-9_\-.]/g, "_");
}

// ------------------------------------------------------------
// 🚀 Main Merge Processor
// ------------------------------------------------------------
export async function mergeProcessor(sessionId, audioChunks = []) {
  info({ sessionId }, "🎧 Starting mergeProcessor");

  if (!Array.isArray(audioChunks) || audioChunks.length === 0) {
    throw new Error("No audio chunks provided for merging");
  }

  try {
    fs.mkdirSync(TMP_DIR, { recursive: true });

    // --------------------------------------------------------
    // 📝 Create list file for FFmpeg concat
    // --------------------------------------------------------
    const validChunks = audioChunks.filter((c) => c && c.url);
    if (validChunks.length === 0)
      throw new Error("No valid chunk URLs to merge");

    const listFile = path.join(TMP_DIR, `${safeFilename(sessionId)}_list.txt`);
    const mergedPath = path.join(TMP_DIR, `${safeFilename(sessionId)}_merged.mp3`);

    const fileListContent = validChunks
      .map((c) => `file '${c.url}'`)
      .join("\n");
    fs.writeFileSync(listFile, fileListContent, "utf8");

    info({ sessionId, listFile, count: validChunks.length }, "🧾 Merge list created");

    // --------------------------------------------------------
    // 🧠 Run FFmpeg concat
    // --------------------------------------------------------
    const command = `${ffmpegPath} -y -f concat -safe 0 -protocol_whitelist file,http,https,tcp,tls -i "${listFile}" -c copy "${mergedPath}"`;
    info({ sessionId, command }, "🎞 Running ffmpeg concat...");

    await execAsync(command, { maxBuffer: 1024 * 1024 * 10 }); // 10MB buffer

    if (!fs.existsSync(mergedPath)) {
      throw new Error("FFmpeg merge output not found");
    }

    const stats = fs.statSync(mergedPath);
    info(
      { sessionId, bytes: stats.size },
      "🎧 Merge completed successfully"
    );

    // --------------------------------------------------------
    // ☁️ Upload merged audio to R2
    // --------------------------------------------------------
    const key = `${sessionId}/${safeFilename(sessionId)}_merged.mp3`;
    const buffer = fs.readFileSync(mergedPath);

    await putObject("merged", key, buffer, "audio/mpeg");
    const publicUrl = `${process.env.R2_PUBLIC_BASE_URL_MERGE}/${encodeURIComponent(key)}`;

    info(
      { sessionId, key, publicUrl, bytes: stats.size },
      "☁️ Uploaded merged MP3 to R2"
    );

    // --------------------------------------------------------
    // 🧹 Cleanup temp files
    // --------------------------------------------------------
    fs.unlinkSync(listFile);
    fs.unlinkSync(mergedPath);

    return { key, publicUrl, bytes: stats.size };
  } catch (err) {
    error(
      { sessionId, error: err.message },
      "💥 mergeProcessor failed"
    );
    throw err;
  }
}

export default { mergeProcessor };
