// ============================================================
// 🎛️ mergeProcessor — Robust MP3 concatenation for TTS chunks
// ============================================================
//
// ✅ Accepts: string[] or { index:number, url:string }[]
// ✅ Sorts correctly (by index, else by filename number)
// ✅ Downloads to /tmp, builds ffmpeg concat list
// ✅ Uses ffmpeg if available; otherwise falls back to buffer concat
// ✅ Uploads to Cloudflare R2 'merged' bucket safely
// ✅ Includes Render-safe keep-alive across the merge stage
// ============================================================

import { info, warn, error } from "#logger.js";
import { putObject, buildPublicUrl } from "#shared/r2-client.js";
import { startKeepAlive, stopKeepAlive } from "../../shared/utils/keepalive.js";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { spawn } from "node:child_process";

// ------------------------------------------------------------
// ⚙️ Config
// ------------------------------------------------------------
const MERGED_BUCKET_KEY = "merged";
const PUBLIC_BASE_URL_MERGE = process.env.R2_PUBLIC_BASE_URL_MERGE || "";

// ------------------------------------------------------------
// 🧩 Helpers
// ------------------------------------------------------------
function toUrlList(input) {
  if (!Array.isArray(input)) return [];

  const mapped = input
    .map((x) =>
      typeof x === "string"
        ? { url: x }
        : x && typeof x === "object"
        ? { index: x.index, url: x.url || x.key || x.href }
        : null
    )
    .filter(Boolean)
    .filter((x) => typeof x.url === "string" && x.url.startsWith("http"));

  const withIndex = mapped.every((m) => Number.isFinite(m.index));
  if (withIndex) {
    return mapped.sort((a, b) => a.index - b.index).map((m) => m.url);
  }

  const rex = /(\d+)(?=\.mp3$)/i;
  return mapped
    .sort((a, b) => {
      const an = Number((a.url.match(rex) || [])[1] || 0);
      const bn = Number((b.url.match(rex) || [])[1] || 0);
      return an - bn;
    })
    .map((m) => m.url);
}

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

async function downloadToFile(url, filePath) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed: ${url} -> ${res.status} ${res.statusText}`);
  const ab = await res.arrayBuffer();
  await fs.writeFile(filePath, Buffer.from(ab));
}

async function whichFfmpeg() {
  try {
    await new Promise((resolve, reject) => {
      const p = spawn("ffmpeg", ["-version"]);
      p.on("error", reject);
      p.on("exit", (code) => (code === 0 ? resolve() : reject(new Error("ffmpeg exit"))));
    });
    return "ffmpeg";
  } catch (_) {}

  try {
    const ff = await import("ffmpeg-static");
    if (ff?.default) return ff.default;
  } catch (_) {}

  return null;
}

async function concatWithFfmpeg(listFile, outFile, ffmpegPath) {
  await new Promise((resolve, reject) => {
    const proc = spawn(ffmpegPath, [
      "-y",
      "-f",
      "concat",
      "-safe",
      "0",
      "-i",
      listFile,
      "-c",
      "copy",
      outFile,
    ]);
    let stderr = "";
    proc.stderr.on("data", (d) => (stderr += d.toString()));
    proc.on("error", reject);
    proc.on("exit", (code) =>
      code === 0 ? resolve() : reject(new Error(stderr || `ffmpeg exited ${code}`))
    );
  });
}

async function concatBuffers(files, outFile) {
  const bufs = await Promise.all(files.map((f) => fs.readFile(f)));
  const total = Buffer.concat(bufs);
  await fs.writeFile(outFile, total);
}

// ------------------------------------------------------------
// 🚀 Main Processor
// ------------------------------------------------------------
export async function mergeProcessor(sessionId, ttsResults) {
  const label = `mergeProcessor:${sessionId}`;
  startKeepAlive(label, 20000);
  info({ sessionId }, "🎧 Starting mergeProcessor (keep-alive active)");

  try {
    // 1️⃣ Build ordered list of URLs
    const urls = toUrlList(ttsResults).filter(Boolean);
    if (!urls.length) throw new Error("No valid chunk URLs to merge");

    // 2️⃣ Prepare temp workspace
    const baseTmp = path.join(os.tmpdir(), "podcast_merge", sessionId);
    const listFile = path.join(baseTmp, `${sessionId}_list.txt`);
    const outFile = path.join(baseTmp, `${sessionId}_merged.mp3`);
    await ensureDir(baseTmp);

    // 3️⃣ Download all chunks
    const localFiles = [];
    for (let i = 0; i < urls.length; i++) {
      const num = String(i + 1).padStart(3, "0");
      const fpath = path.join(baseTmp, `part-${num}.mp3`);
      try {
        await downloadToFile(urls[i], fpath);
        localFiles.push(fpath);
      } catch (err) {
        warn({ sessionId, url: urls[i], err: err.message }, "⚠️ Skipping failed download");
      }
    }
    if (!localFiles.length) throw new Error("All chunk downloads failed — nothing to merge");

    // 4️⃣ Write ffmpeg concat list
    const listContent = localFiles
      .map((p) => `file '${p.replace(/'/g, "'\\''")}'`)
      .join("\n");
    await fs.writeFile(listFile, listContent, "utf-8");

    // 5️⃣ Merge using ffmpeg if available, else buffer concat
    let usedFfmpeg = false;
    const ffmpegPath = await whichFfmpeg();
    if (ffmpegPath) {
      try {
        await concatWithFfmpeg(listFile, outFile, ffmpegPath);
        usedFfmpeg = true;
        info({ sessionId, ffmpegPath }, "🎛️ Merged with ffmpeg");
      } catch (err) {
        warn({ sessionId, err: err.message }, "⚠️ ffmpeg merge failed, falling back to buffer concat");
      }
    } else {
      warn({ sessionId }, "⚠️ ffmpeg not available, using buffer concat fallback");
    }

    if (!usedFfmpeg) {
      await concatBuffers(localFiles, outFile);
      info({ sessionId }, "🎛️ Merged via buffer concatenation");
    }

    // 6️⃣ Upload to Cloudflare R2 — validated + logged
    const key = `${sessionId}.mp3`;
    const mp3Buf = await fs.readFile(outFile);

    const bucketName =
      process.env.R2_BUCKET_MERGED ||
      process.env.R2_BUCKET_PODCAST ||
      "podcast-merged";

    try {
      await putObject(bucketName, key, mp3Buf, "audio/mpeg");

      const publicUrl = buildPublicUrl
        ? buildPublicUrl(bucketName, key)
        : `${(process.env.R2_PUBLIC_BASE_URL_MERGE || "").replace(/\/$/, "")}/${encodeURIComponent(key)}`;

      info(
        { sessionId, key, size: mp3Buf.length, bucketName, publicUrl },
        "💾 Merged MP3 uploaded to R2"
      );

      return { key, url: publicUrl, localPath: outFile, count: localFiles.length };
    } catch (uploadErr) {
      error({ sessionId, err: uploadErr.message, bucketName }, "💥 R2 upload failed in mergeProcessor");
      throw uploadErr;
    }
  } catch (err) {
    error({ sessionId, err: err.message }, "💥 mergeProcessor failed");
    throw err;
  } finally {
    stopKeepAlive(label);
  }
}

export default { mergeProcessor };
