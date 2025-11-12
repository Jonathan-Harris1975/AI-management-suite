// services/tts/utils/mergeProcessor.js
// ============================================================
// 🎧 Merge Processor — downloads remote chunk URLs to /tmp then merges via ffmpeg
// - Accepts an array of PUBLIC HTTPS URLs (from ttsProcessor)
// - Writes concat list with LOCAL paths
// - Uploads merged MP3 to R2 (podcast-merged/<sessionId>.mp3)
// ============================================================

import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import fetch from "node-fetch";
import { info, error } from "#logger.js";
import { startKeepAlive, stopKeepAlive } from "#shared/keepalive.js";
import { uploadBuffer } from "#shared/r2-client.js";

const TMP_DIR = "/tmp/podcast_merge";
const MERGED_BUCKET = "merged";

function ensureTmpDir() {
  if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR, { recursive: true });
}

export async function mergeProcessor(sessionId, chunkUrls = []) {
  startKeepAlive(`mergeProcessor:${sessionId}`, 25000);
  const sid = sessionId || `TT-${Date.now()}`;
  ensureTmpDir();
  info({ sessionId: sid }, "🎧 Starting mergeProcessor");

  try {
    if (!chunkUrls?.length) throw new Error("mergeProcessor requires non-empty array of chunk URLs.");

    // 1) Download each remote MP3 to /tmp
    const localPaths = [];
    for (let i = 0; i < chunkUrls.length; i++) {
      const url = chunkUrls[i];
      const local = path.join(TMP_DIR, `${sid}_chunk_${String(i + 1).padStart(3, "0")}.mp3`);
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Failed to fetch audio chunk: ${url}`);
      const buf = Buffer.from(await res.arrayBuffer());
      fs.writeFileSync(local, buf);
      localPaths.push(local);
    }

    // 2) Build ffmpeg concat list with LOCAL paths
    const listPath = path.join(TMP_DIR, `${sid}_list.txt`);
    const outPath  = path.join(TMP_DIR, `${sid}_merged.mp3`);
    fs.writeFileSync(listPath, localPaths.map(p => `file '${p}'`).join("\n"), "utf8");

    // 3) Merge using stream copy (all chunks are MP3)
    execSync(`ffmpeg -y -f concat -safe 0 -i "${listPath}" -c copy "${outPath}"`, {
      stdio: "pipe",
    });

    // 4) Upload merged MP3 to R2
    const mergedBuf = fs.readFileSync(outPath);
    const mergedKey = `${sid}.mp3`;
    await uploadBuffer(MERGED_BUCKET, mergedKey, mergedBuf, "audio/mpeg");

    info({ sessionId: sid, key: mergedKey, bytes: mergedBuf.length }, "💾 Uploaded merged MP3 to R2");
    stopKeepAlive();
    return { key: mergedKey, localPath: outPath };
  } catch (err) {
    error({ sessionId: sid, error: err.message }, "💥 mergeProcessor failed");
    stopKeepAlive();
    throw err;
  }
}

export default mergeProcessor;
