// ============================================================
// 🎛️ mergeProcessor — Streamed ffmpeg concat (no local temp files)
// ============================================================
//
// ✅ Streams each chunk URL directly into ffmpeg
// ✅ Avoids slow downloads / disk I/O
// ✅ Keeps container alive during entire process
// ✅ Uploads final merged MP3 to R2
// ============================================================

import { info, warn, error } from "#logger.js";
import { putObject, buildPublicUrl } from "#shared/r2-client.js";
import { startKeepAlive, stopKeepAlive } from "../../shared/utils/keepalive.js";
import { spawn } from "node:child_process";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

// ------------------------------------------------------------
// ⚙️ Config
// ------------------------------------------------------------
const BUCKET_MERGED = process.env.R2_BUCKET_MERGED || "podcast-merged";
const PUBLIC_BASE_URL_MERGE = (process.env.R2_PUBLIC_BASE_URL_MERGE || "").replace(/\/$/, "");
const KA_INTERVAL_MS = 15000;

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

async function whichFfmpeg() {
  try {
    const { spawnSync } = await import("node:child_process");
    const res = spawnSync("ffmpeg", ["-version"]);
    if (res.status === 0) return "ffmpeg";
  } catch {}
  try {
    const mod = await import("ffmpeg-static");
    if (mod?.default) return mod.default;
  } catch {}
  throw new Error("ffmpeg binary not found");
}

// ------------------------------------------------------------
// 🚀 Streamed Merge
// ------------------------------------------------------------
export async function mergeProcessor(sessionId, ttsResults) {
  const label = `mergeProcessor:${sessionId}`;
  startKeepAlive(label, KA_INTERVAL_MS);
  info({ sessionId }, "🎧 Starting streamed mergeProcessor (keep-alive active)");

  try {
    const urls = toUrlList(ttsResults);
    if (!urls.length) throw new Error("No valid chunk URLs to merge");

    const ffmpegPath = await whichFfmpeg();
    const key = `${sessionId}.mp3`;

    // ffmpeg concat demuxer via stdin pipes
    const args = [
      "-hide_banner",
      "-loglevel", "error",
      ...urls.flatMap((_, i) => ["-i", `pipe:${i}`]),
      "-filter_complex",
      `concat=n=${urls.length}:v=0:a=1[out]`,
      "-map", "[out]",
      "-f", "mp3",
      "pipe:1"
    ];

    info({ sessionId, inputs: urls.length }, "🎛️ Launching ffmpeg stream concat");

    const ffmpeg = spawn(ffmpegPath, args, { stdio: ["pipe", "pipe", "inherit"] });

    // Start fetching all chunks concurrently and pipe each into ffmpeg.stdinN
    const inputs = urls.map((url, i) => fetch(url).then(res => {
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
      return res.body;
    }));

    // Attach each stream to the correct pipe
    const resolvedStreams = await Promise.all(inputs);

    resolvedStreams.forEach((body, i) => {
      if (body && ffmpeg.stdio[i]) {
        pipeline(body, ffmpeg.stdio[i]).catch(err =>
          warn({ sessionId, i, err: err.message }, "⚠️ Stream pipeline error")
        );
      }
    });

    // Capture merged MP3 from stdout
    const chunks = [];
    for await (const chunk of ffmpeg.stdout) chunks.push(chunk);
    const mergedBuffer = Buffer.concat(chunks);

    info({ sessionId, bytes: mergedBuffer.length }, "🎚️ Stream merge complete");

    // Upload to R2
    await putObject(BUCKET_MERGED, key, mergedBuffer, "audio/mpeg");

    const publicUrl = buildPublicUrl
      ? buildPublicUrl(BUCKET_MERGED, key)
      : `${PUBLIC_BASE_URL_MERGE}/${encodeURIComponent(key)}`;

    info(
      { sessionId, size: mergedBuffer.length, publicUrl },
      "💾 Streamed merge uploaded to R2"
    );

    return { key, url: publicUrl, count: urls.length };
  } catch (err) {
    error({ sessionId, err: err.message }, "💥 Streamed mergeProcessor failed");
    throw err;
  } finally {
    stopKeepAlive(label);
  }
}

export default { mergeProcessor };
