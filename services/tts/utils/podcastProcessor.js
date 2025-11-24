// ============================================================
// 🎚 Podcast Processor — Final Mastering + R2 Upload + Meta
// ============================================================

import { spawn } from "node:child_process";
import { info, warn, error, debug } from "#logger.js";
import { putObject } from "#shared/r2-client.js";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TMP_DIR = "/tmp/podcast_master";
if (!fs.existsSync(TMP_DIR)) {
  fs.mkdirSync(TMP_DIR, { recursive: true });
}

// Helper: run ffmpeg with timeout
function runFFmpeg(args, timeoutMs = 180000) {
  return new Promise((resolve, reject) => {
    const p = spawn("ffmpeg", args);
    let stderr = "";

    const timer = setTimeout(() => {
      p.kill("SIGKILL");
      reject(new Error(`FFmpeg timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    p.stderr.on("data", (d) => (stderr += d.toString()));

    p.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve({ ok: true });
      else reject(new Error(`FFmpeg failed: ${stderr}`));
    });
  });
}

// ============================================================
// 🛡 safePutObject — Safe R2 Upload Wrapper
// ============================================================

async function safePutObject(bucketAlias, key, body, contentType) {
  let ct = contentType;

  if (typeof ct !== "undefined") {
    ct = String(ct)
      .replace(/[\r\n\t]+/g, " ")
      .trim();
  }

  try {
    if (ct) {
      return await putObject(bucketAlias, key, body, ct);
    }
    return await putObject(bucketAlias, key, body);
  } catch (err) {
    const msg = String(err?.message || "");
    const isHeaderError =
      err?.code === "ERR_INVALID_CHAR" ||
      msg.includes('Invalid character in header content ["content-type"]');

    if (!isHeaderError) throw err;

    warn("⚠️ Retrying putObject without contentType due to invalid header", {
      bucketAlias,
      key,
      error: err.message,
    });

    return await putObject(bucketAlias, key, body);
  }
}

// ============================================================
// 🧹 Clean Temp Files
// ============================================================

function cleanup(files) {
  for (const f of files) {
    try {
      if (fs.existsSync(f)) fs.unlinkSync(f);
    } catch (_) {}
  }
}

// ============================================================
// 📰 updateMetaFile — Final JSON metadata writer
// ============================================================

async function updateMetaFile(sessionId, finalBuffer, finalPath, podcastUrl) {
  const metaKey = `${sessionId}.json`;

  const metaBaseUrl = process.env.R2_PUBLIC_BASE_URL_META || "";
  const artBaseUrl = process.env.R2_PUBLIC_BASE_URL_ART || "";
  const transcriptBaseUrl =
    process.env.R2_PUBLIC_BASE_URL_TRANSCRIPT ||
    process.env.R2_PUBLIC_BASE_URL_RAW_TEXT ||
    "";

  const metaUrl = metaBaseUrl ? `${metaBaseUrl}/${metaKey}` : "";

  let existing = {};

  // Attempt to load existing meta (if exists)
  if (metaUrl) {
    try {
      const res = await fetch(metaUrl, { signal: AbortSignal.timeout(8000) });
      if (
        res.ok &&
        res.headers.get("content-type")?.includes("application/json")
      ) {
        existing = await res.json();
      }
    } catch (_) {}
  }

  const sessionDate =
    existing?.session?.date ||
    existing?.createdAt ||
    new Date().toISOString();

  // Extract duration (best-effort)
  let duration = null;
  try {
    const { stdout } = await new Promise((resolve) => {
      const ff = spawn(
        "ffprobe",
        [
          "-v",
          "error",
          "-show_entries",
          "format=duration",
          "-of",
          "default=noprint_wrappers=1:nokey=1",
          finalPath,
        ],
        { stdio: ["ignore", "pipe", "pipe"] }
      );
      let out = "";
      ff.stdout.on("data", (d) => (out += d.toString()));
      ff.on("close", () => resolve({ stdout: out }));
    });
    const d = parseFloat(stdout.trim());
    if (!Number.isNaN(d)) duration = d;
  } catch (_) {}

  const fileSize = finalBuffer.length;

  const updated = {
    session: { sessionId, date: sessionDate },

    title: existing.title || "Untitled Episode",
    description: existing.description || "",
    keywords: existing.keywords || [],
    artworkPrompt: existing.artworkPrompt || "",
    episodeNumber: existing.episodeNumber || 1,

    createdAt: existing.createdAt || sessionDate,
    updatedAt: new Date().toISOString(),

    artUrl: artBaseUrl ? `${artBaseUrl}/${sessionId}.png` : existing.artUrl,
    transcriptUrl: transcriptBaseUrl
      ? `${transcriptBaseUrl}/${sessionId}.txt`
      : existing.transcriptUrl,
    podcastUrl,

    duration,
    fileSize,
    pubDate: new Date(sessionDate).toUTCString(),
  };

  await safePutObject(
    "meta",
    metaKey,
    Buffer.from(JSON.stringify(updated, null, 2)),
    "application/json"
  );

  return { metaKey, metaUrl };
}

// ============================================================
// 🎧 Main Podcast Processor
// ============================================================

export async function podcastProcessor(sessionId, editedBuffer) {
  info("🎚 Starting Podcast Mixdown", { sessionId });

  const introUrl = process.env.PODCAST_INTRO_URL;
  const outroUrl = process.env.PODCAST_OUTRO_URL;

  const introFile = `${TMP_DIR}/${sessionId}_intro.mp3`;
  const mainFile = `${TMP_DIR}/${sessionId}_main.mp3`;
  const outroFile = `${TMP_DIR}/${sessionId}_outro.mp3`;
  const finalFile = `${TMP_DIR}/${sessionId}_final.mp3`;

  // Write editedBuffer to temp main file
  fs.writeFileSync(mainFile, editedBuffer);

  // Download intro/outro
  const download = async (url, dest) => {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to download ${url}`);
    const buf = Buffer.from(await res.arrayBuffer());
    fs.writeFileSync(dest, buf);
  };

  await download(introUrl, introFile);
  await download(outroUrl, outroFile);

  // Concat using demuxer
  const concatList = `${TMP_DIR}/${sessionId}_list.txt`;
  fs.writeFileSync(
    concatList,
    `file '${introFile}'\nfile '${mainFile}'\nfile '${outroFile}'\n`
  );

  await runFFmpeg(
    [
      "-y",
      "-f",
      "concat",
      "-safe",
      "0",
      "-i",
      concatList,
      "-c",
      "copy",
      finalFile,
    ],
    Number(process.env.PODCAST_FFMPEG_TIMEOUT_MS) || 180000
  );

  const finalBuffer = fs.readFileSync(finalFile);

  const podcastKey = `${sessionId}_podcast.mp3`;
  const podcastUrl = `${process.env.R2_PUBLIC_BASE_URL_PODCAST}/${podcastKey}`;

  await safePutObject("podcast", podcastKey, finalBuffer, "audio/mpeg");
  info("📡 Uploaded final podcast", { sessionId, podcastKey });

  await updateMetaFile(sessionId, finalBuffer, finalFile, podcastUrl);

  cleanup([introFile, mainFile, outroFile, finalFile, concatList]);

  return {
    buffer: finalBuffer,
    key: podcastKey,
    url: podcastUrl,
  };
}

export default podcastProcessor;
