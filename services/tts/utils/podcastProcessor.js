// ============================================================
// 🎧 podcastProcessor — Final master mix (intro/outro, fade, normalization)
// ============================================================

import { info, error } from "#logger.js";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { startKeepAlive, stopKeepAlive } from "../../shared/utils/keepalive.js";
import { putObject, buildPublicUrl } from "#shared/r2-client.js";

const INTRO_URL = process.env.PODCAST_INTRO_URL;
const OUTRO_URL = process.env.PODCAST_OUTRO_URL;
const FINAL_BUCKET_KEY = "podcast";

async function findFfmpeg() {
  try {
    await new Promise((res, rej) => {
      const p = spawn("ffmpeg", ["-version"]);
      p.once("error", rej);
      p.once("exit", c => (c === 0 ? res() : rej(new Error("ffmpeg exit"))));
    });
    return "ffmpeg";
  } catch {
    const mod = await import("ffmpeg-static").catch(() => null);
    if (mod?.default) return mod.default;
    throw new Error("❌ ffmpeg not found");
  }
}

export async function podcastProcessor(sessionId, editedBuffer) {
  const label = `podcastProcessor:${sessionId}`;
  startKeepAlive(label, 20000);
  info({ sessionId }, "🎧 Starting Podcast Processor (keep-alive active)");

  try {
    const tmpDir = path.join(os.tmpdir(), "tts_podcast", sessionId);
    await fs.mkdir(tmpDir, { recursive: true });
    const mainPath = path.join(tmpDir, "edited.mp3");
    const introPath = path.join(tmpDir, "intro.mp3");
    const outroPath = path.join(tmpDir, "outro.mp3");
    const outputPath = path.join(tmpDir, `${sessionId}_final.mp3`);

    await fs.writeFile(mainPath, editedBuffer);

    // Download intro/outro
    await downloadIfExists(INTRO_URL, introPath);
    await downloadIfExists(OUTRO_URL, outroPath);

    // Build concat list
    const parts = [introPath, mainPath, outroPath].filter(f => fs.stat(f).catch(() => null));
    const concatList = path.join(tmpDir, "concat.txt");
    await fs.writeFile(concatList, parts.map(p => `file '${p}'`).join("\n"));

    const ffmpegPath = await findFfmpeg();
    const args = [
      "-y",
      "-f",
      "concat",
      "-safe",
      "0",
      "-i",
      concatList,
      "-af",
      "loudnorm=I=-16:TP=-1.5:LRA=11,highpass=f=80,lowpass=f=14000",
      "-b:a",
      "192k",
      outputPath
    ];

    info({ sessionId }, "🎛️ Mixing intro/outro and normalizing");
    await runFfmpeg(ffmpegPath, args);

    const finalBuf = await fs.readFile(outputPath);
    await putObject(FINAL_BUCKET_KEY, `${sessionId}.mp3`, finalBuf, "audio/mpeg");
    const url = buildPublicUrl(FINAL_BUCKET_KEY, `${sessionId}.mp3`);
    info({ sessionId, url }, "✅ Final podcast uploaded");
    return finalBuf;
  } catch (err) {
    error({ sessionId, err: err.message }, "💥 podcastProcessor failed");
    throw err;
  } finally {
    stopKeepAlive(label);
  }
}

async function runFfmpeg(ffmpeg, args) {
  return new Promise((resolve, reject) => {
    const p = spawn(ffmpeg, args);
    let stderr = "";
    p.stderr.on("data", d => (stderr += d.toString()));
    p.on("exit", c => (c === 0 ? resolve() : reject(new Error(stderr))));
  });
}

async function downloadIfExists(url, dest) {
  if (!url) return;
  const res = await fetch(url);
  if (res.ok) {
    const buf = Buffer.from(await res.arrayBuffer());
    await fs.writeFile(dest, buf);
  }
}

export default { podcastProcessor };
