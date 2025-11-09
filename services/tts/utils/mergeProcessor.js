// ============================================================
// 🎧 TTS Merge Processor — Combine all chunk files into one MP3
// ============================================================

import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import fetch from "node-fetch";
import { info, error } from "#logger.js";
import { uploadBuffer } from "#shared/r2-client.js";

const TMP_DIR = "/tmp/podcast_merge";

function ensureTmpDir() {
  if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR, { recursive: true });
  return TMP_DIR;
}

// ------------------------------------------------------------
// 🧩 Merge TTS Chunks (downloads remote R2 files before merging)
// ------------------------------------------------------------
export async function mergeProcessor(sessionId, chunkFiles = []) {
  ensureTmpDir();
  info({ sessionId }, "🎧 Starting mergeProcessor");

  try {
    if (!chunkFiles?.length) {
      throw new Error("mergeProcessor requires local or remote chunk list.");
    }

    // Download all remote MP3s to local /tmp
    const localPaths = [];
    for (let i = 0; i < chunkFiles.length; i++) {
      const url = chunkFiles[i];
      const localPath = path.join(TMP_DIR, `${sessionId}_chunk_${i + 1}.mp3`);

      const res = await fetch(url);
      if (!res.ok) throw new Error(`Failed to fetch chunk ${url}`);
      const buf = Buffer.from(await res.arrayBuffer());
      fs.writeFileSync(localPath, buf);
      localPaths.push(localPath);
    }

    const concatListPath = path.join(TMP_DIR, `${sessionId}_list.txt`);
    const outputFile = path.join(TMP_DIR, `${sessionId}_merged.mp3`);

    // Write ffmpeg concat list with LOCAL paths
    fs.writeFileSync(
      concatListPath,
      localPaths.map((f) => `file '${f}'`).join("\n"),
      "utf8"
    );

    // Merge locally downloaded files
    execSync(`ffmpeg -y -f concat -safe 0 -i ${concatListPath} -c copy ${outputFile}`, {
      stdio: "pipe",
    });

    const mergedBuffer = fs.readFileSync(outputFile);
    const key = `${sessionId}_merged.mp3`;

    await uploadBuffer("merged", key, mergedBuffer, "audio/mpeg");
    info({ sessionId, key }, "💾 Uploaded merged MP3 to R2");

    return outputFile;
  } catch (err) {
    error({ sessionId, error: err.message }, "💥 mergeProcessor failed");
    throw err;
  }
}
