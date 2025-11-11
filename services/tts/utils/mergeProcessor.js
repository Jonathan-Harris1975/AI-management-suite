// ============================================================
// 🎛️ mergeProcessor — Robust MP3 concatenation for TTS chunks
// ============================================================
//
// ✅ Bounded-parallel downloads with per-chunk timeout + retries
// ✅ ffmpeg concat demuxer with safe fallback to buffer concat
// ✅ Render-safe keep-alive active during entire stage
// ✅ Explicit R2 upload with strong logging & URL building
// ============================================================

import { info, warn, error } from "#logger.js";
import { putObject, buildPublicUrl } from "#shared/r2-client.js";
import { startKeepAlive, stopKeepAlive } from "../../shared/utils/keepalive.js";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { spawn } from "node:child_process";

// ------------------------------------------------------------
// ⚙️ Tunables
// ------------------------------------------------------------
const DL_CONCURRENCY = Number(process.env.MERGE_DL_CONCURRENCY || 4);
const DL_TIMEOUT_MS  = Number(process.env.MERGE_DL_TIMEOUT_MS  || 60_000);
const DL_RETRIES     = Number(process.env.MERGE_DL_RETRIES     || 2);
const KA_INTERVAL_MS = Number(process.env.MERGE_KEEPALIVE_MS   || 15_000);

const PUBLIC_BASE_URL_MERGE = (process.env.R2_PUBLIC_BASE_URL_MERGE || "").replace(/\/$/, "");
const BUCKET_MERGED = process.env.R2_BUCKET_MERGED || process.env.R2_BUCKET_PODCAST || "podcast-merged";

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

async function fetchWithTimeout(url, timeoutMs) {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(new Error(`Timeout ${timeoutMs}ms`)), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    return res;
  } finally {
    clearTimeout(id);
  }
}

async function downloadToFile(url, filePath, timeoutMs, attempt = 0) {
  try {
    const res = await fetchWithTimeout(url, timeoutMs);
    if (!res.ok) {
      throw new Error(`Download failed: ${url} -> ${res.status} ${res.statusText}`);
    }
    const ab = await res.arrayBuffer();
    await fs.writeFile(filePath, Buffer.from(ab));
  } catch (err) {
    if (attempt < DL_RETRIES) {
      warn({ url, attempt, err: err.message }, "↻ Retrying chunk download");
      return downloadToFile(url, filePath, timeoutMs, attempt + 1);
    }
    throw err;
  }
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

// Simple bounded concurrency runner
async function mapLimit(items, limit, fn) {
  const results = new Array(items.length);
  let idx = 0;
  let active = 0;

  return await new Promise((resolve, reject) => {
    const next = () => {
      if (idx >= items.length && active === 0) return resolve(results);
      while (active < limit && idx < items.length) {
        const i = idx++;
        active++;
        Promise.resolve(fn(items[i], i))
          .then((r) => (results[i] = r))
          .catch((e) => (results[i] = { __error: e }))
          .finally(() => {
            active--;
            next();
          });
      }
    };
    next();
  });
}

// ------------------------------------------------------------
// 🚀 Main Processor
// ------------------------------------------------------------
export async function mergeProcessor(sessionId, ttsResults) {
  const label = `mergeProcessor:${sessionId}`;
  startKeepAlive(label, KA_INTERVAL_MS);
  info(
    { sessionId, DL_CONCURRENCY, DL_TIMEOUT_MS, DL_RETRIES, KA_INTERVAL_MS, bucket: BUCKET_MERGED },
    "🎧 Starting mergeProcessor (keep-alive active)"
  );

  try {
    // 1️⃣ URLs
    const urls = toUrlList(ttsResults).filter(Boolean);
    if (!urls.length) throw new Error("No valid chunk URLs to merge");

    // 2️⃣ Temp workspace
    const baseTmp = path.join(os.tmpdir(), "podcast_merge", sessionId);
    const listFile = path.join(baseTmp, `${sessionId}_list.txt`);
    const outFile = path.join(baseTmp, `${sessionId}_merged.mp3`);
    await ensureDir(baseTmp);

    // 3️⃣ Parallel downloads with timeout & retry
    const localFiles = new Array(urls.length);
    await mapLimit(urls, DL_CONCURRENCY, async (url, i) => {
      const num = String(i + 1).padStart(3, "0");
      const fpath = path.join(baseTmp, `part-${num}.mp3`);
      try {
        await downloadToFile(url, fpath, DL_TIMEOUT_MS);
        localFiles[i] = fpath;
      } catch (err) {
        warn({ sessionId, url, err: err.message }, "⚠️ Skipping failed download");
      }
    });

    const filtered = localFiles.filter(Boolean);
    if (!filtered.length) throw new Error("All chunk downloads failed — nothing to merge");

    // 4️⃣ Write ffmpeg concat list (only the files that downloaded)
    const listContent = filtered.map((p) => `file '${p.replace(/'/g, "'\\''")}'`).join("\n");
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
      await concatBuffers(filtered, outFile);
      info({ sessionId }, "🎛️ Merged via buffer concatenation");
    }

    // 6️⃣ Upload to Cloudflare R2 — validated + logged
    const key = `${sessionId}.mp3`;
    const mp3Buf = await fs.readFile(outFile);

    try {
      await putObject(BUCKET_MERGED, key, mp3Buf, "audio/mpeg");

      const publicUrl = buildPublicUrl
        ? buildPublicUrl(BUCKET_MERGED, key)
        : `${PUBLIC_BASE_URL_MERGE}/${encodeURIComponent(key)}`;

      info(
        { sessionId, key, size: mp3Buf.length, bucketName: BUCKET_MERGED, publicUrl },
        "💾 Merged MP3 uploaded to R2"
      );

      return { key, url: publicUrl, localPath: outFile, count: filtered.length };
    } catch (uploadErr) {
      error({ sessionId, err: uploadErr.message, bucketName: BUCKET_MERGED }, "💥 R2 upload failed in mergeProcessor");
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
