// ============================================================
// 🎛️ mergeProcessor — Robust MP3 concatenation for TTS chunks
// ============================================================
//
// ✅ Accepts: string[] (urls) OR { index:number, url:string }[]
// ✅ Sorts correctly (by index, else by filename number)
// ✅ Downloads to /tmp, builds ffmpeg concat list
// ✅ Uses ffmpeg if available; otherwise falls back to buffer concat
// ✅ Uploads to R2 'merged' bucket and returns { key, url }
// ✅ Now includes render-safe keep-alive throughout the merge stage
// ============================================================

import { info, warn, error } from "#logger.js";
import { putObject, buildPublicUrl } from "#shared/r2-client.js";
import { startKeepAlive, stopKeepAlive } from "../../shared/utils/keepalive.js";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { spawn } from "node:child_process";

// ---------- Config ----------
const MERGED_BUCKET_KEY = "merged"; // R2 alias handled in r2-client
const PUBLIC_BASE_URL_MERGE =
  process.env.R2_PUBLIC_BASE_URL_MERGE || "";

// ---------- Helpers ----------
function toUrlList(input) {
  if (!Array.isArray(input)) return [];

  // normalise to { index?:number, url:string }
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

  // primary: sort by explicit index
  const withIndex = mapped.every((m) => Number.isFinite(m.index));
  if (withIndex) {
    return mapped.sort((a, b) => a.index - b.index).map((m) => m.url);
  }

  // fallback: sort by audio-###.mp3 numeral if present
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
  if (!res.ok) {
    throw new Error(`Download failed: ${url} -> ${res.status} ${res.statusText}`);
  }
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

// ---------- Main ----------
export async function mergeProcessor(sessionId, ttsResults) {
  const label = `mergeProcessor:${sessionId}`;
  startKeepAlive(label, 20000); // keep alive every 20s
  info({ sessionId }, "🎧 Starting mergeProcessor (keep-alive active)");

  try {
    // 1) Build ordered list of URLs
    const urls = toUrlList(ttsResults).filter(Boolean);
    if (!urls.length) throw new Error("No valid chunk URLs to merge");

    // 2) Prep temp workspace
    const baseTmp = path.join(os.tmpdir(), "podcast_merge", sessionId);
    const listFile = path.join(baseTmp, `${sessionId}_list.txt`);
    const outFile = path.join(baseTmp, `${sessionId}_merged.mp3`);
    await ensureDir(baseTmp);

    // 3) Download all parts
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
    if (!localFiles.length)
      throw new Error("All chunk downloads failed — nothing to merge");

    // 4) Write ffmpeg concat list
    const listContent = localFiles
      .map((p) => `file '${p.replace(/'/g, "'\\''")}'`)
      .join("\n");
    await fs.writeFile(listFile, listContent, "utf-8");

    // 5) Try ffmpeg, else fallback to buffer concat
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

    // 6) Upload to R2 (merged bucket)
    const key = `${sessionId}.mp3`;
    const mp3Buf = await fs.readFile(outFile);
    await putObject(MERGED_BUCKET_KEY, key, mp3Buf, "audio/mpeg");
    const publicUrl = buildPublicUrl
      ? buildPublicUrl(MERGED_BUCKET_KEY, key)
      : `${PUBLIC_BASE_URL_MERGE}/${encodeURIComponent(key)}`;

    info(
      { sessionId, key, size: mp3Buf.length, publicUrl },
      "💾 Merged MP3 uploaded to R2"
    );

    // 7) Return metadata for next stage (editingProcessor)
    return { key, url: publicUrl, localPath: outFile, count: localFiles.length };
  } catch (err) {
    error({ sessionId, err: err.message }, "💥 mergeProcessor failed");
    throw err;
  } finally {
    stopKeepAlive(label);
  }
}

export default { mergeProcessor };
