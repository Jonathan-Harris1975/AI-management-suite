import {s3, R2_BUCKETS, uploadBuffer, listKeys, getObjectAsText} from "../../shared/utils/r2-client.js";
// utils/audio.js
import fs from "fs";
import os from "os";
import path from "path";
import { execFile } from "child_process";
import ffmpegPath from "ffmpeg-static";
import ffprobe from "ffprobe-static";
import { log } from "../../../utils/logger.js";
import { validateEnv } from "../services/env-checker.js";
validateEnv();          // hard-stop if any env var is missing
// single HeadBucket probe (no retries/ping)
function runFFmpeg(args) {
  return new Promise((resolve, reject) => {
    execFile(ffmpegPath, args, (err, stdout, stderr) => {
      if (err) {
        const e = new Error(err.message);
        e.stderr = stderr?.toString();
        return reject(e);
      }
      resolve({ stdout: stdout?.toString(), stderr: stderr?.toString() });
    });
  });
}

function runFFprobe(file) {
  return new Promise((resolve, reject) => {
    execFile(ffprobe.path, ["-v", "error", "-show_entries", "format=duration,size", "-of", "json", file], (err, stdout, stderr) => {
      if (err) return reject(err);
      try {
        const j = JSON.parse(stdout || "{}");
        const dur = parseFloat(j?.format?.duration || "0");
        const size = parseInt(j?.format?.size || "0", 10);
        resolve({ durationSec: Math.round(dur), fileSize: size });
      } catch (e) {
        reject(e);
      }
    });
  });
}

// Merge chunk mp3s from RAW bucket → merged.mp3 in MERGED bucket
export async function mergeChunks(sessionId) {
  const prefix = `${sessionId}/`;
  const keys = await listKeys({ bucket: R2_BUCKETS.RAW, prefix });
  const ordered = keys
    .filter(k => /chunk-\d+\.mp3$/.test(k))
    .sort((a,b) => {
      const na = parseInt(a.match(/chunk-(\d+)\.mp3$/)?.[1] || "0", 10);
      const nb = parseInt(b.match(/chunk-(\d+)\.mp3$/)?.[1] || "0", 10);
      return na - nb;
    });
  if (!ordered.length) throw new Error("No audio chunks to merge");

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), `merge-${sessionId}-`));
  const concatList = path.join(tmp, "concat.txt");
  const localFiles = [];
  for (let i = 0; i < ordered.length; i++) {
    const key = ordered[i];
    const local = path.join(tmp, `chunk-${i}.mp3`);
    await downloadToFile({ bucket: R2_BUCKETS.RAW, key, filepath: local });
    localFiles.push(local);
  }
  fs.writeFileSync(concatList, localFiles.map(f => `file '${f.replace(/'/g, "'\\''")}'`).join("\n"));

  const mergedWav = path.join(tmp, "merged.wav");
  await runFFmpeg(["-f", "concat", "-safe", "0", "-i", concatList, "-acodec", "pcm_s16le", "-ar", "44100", "-ac", "2", mergedWav]);

  const mergedMp3 = path.join(tmp, "merged.mp3");
  await runFFmpeg(["-i", mergedWav, "-codec:a", "libmp3lame", "-b:a", "192k", mergedMp3]);

  const buf = fs.readFileSync(mergedMp3);
  const outKey = `${sessionId}/merged.mp3`;
  await uploadBuffer({ bucket: R2_BUCKETS.MERGED, key: outKey, body: buf, contentType: "audio/mpeg" });

  fs.rmSync(tmp, { recursive: true, force: true });
  return { mergedKey: outKey, mergedUrl: buildPublicUrl(R2_BUCKETS.MERGED, outKey) };
}

// Edit pipeline: filters + fade + stitch intro/outro; upload final + meta
export async function normalizeAndFinalize(sessionId) {
  const introUrl = process.env.PODCAST_INTRO_URL;
  const outroUrl = process.env.PODCAST_OUTRO_URL;
  if (!introUrl || !outroUrl) throw new Error("PODCAST_INTRO_URL and PODCAST_OUTRO_URL must be set");

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), `edit-${sessionId}-`));
  const mergedKey = `${sessionId}/merged.mp3`;
  const mergedLocal = path.join(tmp, "merged.mp3");
  await downloadToFile({ bucket: R2_BUCKETS.MERGED, key: mergedKey, filepath: mergedLocal });

  // Download intro/outro by HTTP
  const fetch = (await import("node-fetch")).default;
  const introLocal = path.join(tmp, "intro.mp3");
  const outroLocal = path.join(tmp, "outro.mp3");
  for (const [url, dst] of [[introUrl, introLocal],[outroUrl, outroLocal]]) {
    const r = await fetch(url);
    if (!r.ok) throw new Error(`fetch ${url} -> ${r.status}`);
    const b = Buffer.from(await r.arrayBuffer());
    fs.writeFileSync(dst, b);
  }

  // Advanced filter chain from your spec
  const filter = "highpass=f=100,lowpass=f=10000,afftdn=nr=10:tn=1,firequalizer=gain_entry='entry(150,3);entry(2500,2)',deesser=f=7000:i=0.7,acompressor=threshold=-24dB:ratio=4:attack=10:release=200:makeup=5,dynaudnorm=f=100:n=0:p=0.9,aresample=44100,aconvolution=reverb=0.1:0.1:0.9:0.9";

  // Process main merged audio to WAV stereo 44.1k
  const mainWav = path.join(tmp, "main.wav");
  await runFFmpeg(["-i", mergedLocal, "-af", filter, "-ar", "44100", "-ac", "2", mainWav]);

  // Fade intro/outro using template strings at runtime
  const introMin = Math.max(parseInt(process.env.MIN_INTRO_DURATION || "16", 10), 5);
  const outroMin = Math.max(parseInt(process.env.MIN_OUTRO_DURATION || "15", 10), 5);
  const introWav = path.join(tmp, "intro.wav");
  const outroWav = path.join(tmp, "outro.wav");

  const introFade = `afade=t=in:st=0:d=2,afade=t=out:st=${Math.max(1,introMin-2)}:d=2`;
  const outroFade = `afade=t=in:st=0:d=2,afade=t=out:st=${Math.max(1,outroMin-2)}:d=2`;

  await runFFmpeg(["-i", introLocal, "-af", introFade, "-ar", "44100", "-ac", "2", introWav]);
  await runFFmpeg(["-i", outroLocal, "-af", outroFade, "-ar", "44100", "-ac", "2", outroWav]);

  // Concat intro + main + outro
  const listFile = path.join(tmp, "concat_final.txt");
  fs.writeFileSync(listFile, [introWav, mainWav, outroWav].map(f => `file '${f.replace(/'/g, "'\\''")}'`).join("\n"));

  const finalMp3 = path.join(tmp, "final.mp3");
  await runFFmpeg(["-f", "concat", "-safe", "0", "-i", listFile, "-codec:a", "libmp3lame", "-b:a", "192k", finalMp3]);

  const meta = await runFFprobe(finalMp3);

  const buf = fs.readFileSync(finalMp3);
  const outKey = `${sessionId}/final.mp3`;
  await uploadBuffer({ bucket: R2_BUCKETS.PODCAST, key: outKey, body: buf, contentType: "audio/mpeg" });

  const metaObj = {
    sessionId,
    finalKey: outKey,
    finalUrl: buildPublicUrl(R2_BUCKETS.PODCAST, outKey),
    durationSec: meta.durationSec,
    fileSize: meta.fileSize,
    createdAt: new Date().toISOString()
  };
  const metaBuf = Buffer.from(JSON.stringify(metaObj, null, 2));
  await uploadBuffer({ bucket: R2_BUCKETS.META, key: `${sessionId}/meta.json`, body: metaBuf, contentType: "application/json" });

  fs.rmSync(tmp, { recursive: true, force: true });
  return metaObj;
}
