
// ============================================================
// 🎚 Podcast Processor — Clean Final Version (Fully Updated)
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
if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR, { recursive: true });

function runFFmpeg(args, timeoutMs = 180000) {
  return new Promise((resolve, reject) => {
    const p = spawn("ffmpeg", args);
    let stderr = "";

    const timer = setTimeout(() => {
      p.kill("SIGKILL");
      reject(new Error("FFmpeg timed out"));
    }, timeoutMs);

    p.stderr.on("data", (d) => (stderr += d.toString()));
    p.on("close", (code) => {
      clearTimeout(timer);
      code === 0 ? resolve({ ok: true }) : reject(new Error(stderr));
    });
  });
}

// ============================================================
// Safe R2 Upload (correct + sanitized)
// ============================================================

async function safePutObject(bucketAlias, key, body, contentType) {
  let ct = contentType;

  if (ct !== undefined) {
    ct = String(ct).replace(/[\r\n\t]+/g, " ").trim();
  }

  try {
    if (ct) return await putObject(bucketAlias, key, body, ct);
    return await putObject(bucketAlias, key, body);
  } catch (err) {
    const msg = String(err?.message || "");
    const headerErr =
      err?.code === "ERR_INVALID_CHAR" ||
      msg.includes('Invalid character in header content ["content-type"]');

    if (!headerErr) throw err;

    warn("⚠️ Retrying without contentType", {
      bucketAlias,
      key,
      error: err.message,
    });

    return await putObject(bucketAlias, key, body);
  }
}

function cleanup(files) {
  files.forEach((f) => {
    try {
      if (fs.existsSync(f)) fs.unlinkSync(f);
    } catch {}
  });
}

// ============================================================
// Metadata Update
// ============================================================

async function updateMetaFile(sessionId, finalBuffer, finalPath, podcastUrl) {
  const metaKey = `${sessionId}.json`;

  const metaBase = process.env.R2_PUBLIC_BASE_URL_META || "";
  const artBase = process.env.R2_PUBLIC_BASE_URL_ART || "";
  const transcriptBase =
    process.env.R2_PUBLIC_BASE_URL_TRANSCRIPT ||
    process.env.R2_PUBLIC_BASE_URL_RAW_TEXT ||
    "";

  const metaUrl = metaBase ? `${metaBase}/${metaKey}` : "";

  let existing = {};
  try {
    if (metaUrl) {
      const res = await fetch(metaUrl);
      if (res.ok && res.headers.get("content-type")?.includes("application/json"))
        existing = await res.json();
    }
  } catch {}

  const sessionDate =
    existing?.session?.date ||
    existing?.createdAt ||
    new Date().toISOString();

  let duration = null;
  try {
    const { stdout } = await new Promise((resolve) => {
      const ff = spawn("ffprobe", [
        "-v",
        "error",
        "-show_entries",
        "format=duration",
        "-of",
        "default=noprint_wrappers=1:nokey=1",
        finalPath,
      ]);
      let out = "";
      ff.stdout.on("data", (d) => (out += d.toString()));
      ff.on("close", () => resolve({ stdout: out }));
    });

    const d = parseFloat(stdout.trim());
    if (!isNaN(d)) duration = d;
  } catch {}

  const updated = {
    session: { sessionId, date: sessionDate },
    title: existing.title || "Untitled Episode",
    description: existing.description || "",
    keywords: existing.keywords || [],
    artworkPrompt: existing.artworkPrompt || "",
    episodeNumber: existing.episodeNumber || 1,
    createdAt: existing.createdAt || sessionDate,
    updatedAt: new Date().toISOString(),
    artUrl: `${artBase}/${sessionId}.png`,
    transcriptUrl: `${transcriptBase}/${sessionId}.txt`,
    podcastUrl,
    duration,
    fileSize: finalBuffer.length,
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
// Main Processor — uses edited audio from R2 (Option B)
// ============================================================

export async function podcastProcessor(sessionId, editedBufferIgnored) {
  info("🎚 Fetching edited audio from R2", { sessionId });

  const editedUrl = `${process.env.R2_PUBLIC_BASE_URL_EDITED_AUDIO}/${sessionId}_edited.mp3`;

  const res = await fetch(editedUrl);
  if (!res.ok) throw new Error("Failed to fetch edited audio from R2");

  const editedBuffer = Buffer.from(await res.arrayBuffer());

  info("🎧 Retrieved edited audio", { sessionId });

  const introUrl = process.env.PODCAST_INTRO_URL;
  const outroUrl = process.env.PODCAST_OUTRO_URL;

  const intro = `${TMP_DIR}/${sessionId}_intro.mp3`;
  const main = `${TMP_DIR}/${sessionId}_main.mp3`;
  const outro = `${TMP_DIR}/${sessionId}_outro.mp3`;
  const final = `${TMP_DIR}/${sessionId}_final.mp3`;

  fs.writeFileSync(main, editedBuffer);

  async function dl(url, dest) {
    const r = await fetch(url);
    if (!r.ok) throw new Error(`Download failed: ${url}`);
    fs.writeFileSync(dest, Buffer.from(await r.arrayBuffer()));
  }

  await dl(introUrl, intro);
  await dl(outroUrl, outro);

  const list = `${TMP_DIR}/${sessionId}_list.txt`;
  fs.writeFileSync(
    list,
    `file '${intro}'
file '${main}'
file '${outro}'
`
  );

  await runFFmpeg(["-y", "-f", "concat", "-safe", "0", "-i", list, "-c", "copy", final]);

  const finalBuffer = fs.readFileSync(final);

  const podcastKey = `${sessionId}.mp3`;
  const podcastUrl = `${process.env.R2_PUBLIC_BASE_URL_PODCAST}/${podcastKey}`;

  await safePutObject("podcast", podcastKey, finalBuffer, "audio/mpeg");

  info("📡 Uploaded final podcast", { sessionId, podcastKey });

  await updateMetaFile(sessionId, finalBuffer, final, podcastUrl);

  cleanup([intro, main, outro, final, list]);

  return {
    buffer: finalBuffer,
    key: podcastKey,
    url: podcastUrl,
  };
}

export default podcastProcessor;
