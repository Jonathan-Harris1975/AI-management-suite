// ============================================================
// 🎛️ mergeProcessor — Crash-proof ffmpeg concat on Render
// ============================================================
// Fixes:
//  - Avoids ffmpeg-static SIGSEGV by preferring @ffmpeg-installer/system
//  - Falls back across binaries automatically on failure
//  - Re-encodes to MP3 (libmp3lame) to prevent copy/mux issues
//  - Uses a temp concat list file (not stdin)
//  - Streams upload to R2 (no large in-memory buffers)
//  - Clear error reporting: code vs signal
// ============================================================

import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { info, warn, error } from "#logger.js";
import { putObject } from "#shared/r2-client.js";
import * as retryModule from "../../../utils/retry.js";

// Optional — keepalive imports if you have them; safe to no-op if not present
let startKeepAlive = () => null;
let stopKeepAlive = () => null;
try {
  const ka = await import("../../shared/utils/keepalive.js");
  startKeepAlive = ka.startKeepAlive ?? startKeepAlive;
  stopKeepAlive = ka.stopKeepAlive ?? stopKeepAlive;
} catch (_) {}

const withRetries = retryModule.withRetries || retryModule.default;

const MERGED_BUCKET = process.env.R2_BUCKET_MERGED || "podcast-merged";
const PUBLIC_BASE_URL_MERGED =
  process.env.R2_PUBLIC_BASE_URL_MERGED || process.env.R2_PUBLIC_BASE_URL_PODCAST;
const PUBLIC_BASE_URL_CHUNKS = process.env.R2_PUBLIC_BASE_URL_CHUNKS;

function requireEnv(name, val) {
  if (!val) throw new Error(`Missing required env: ${name}`);
}
requireEnv("R2_BUCKET_MERGED", MERGED_BUCKET);
requireEnv("R2_PUBLIC_BASE_URL_MERGED", PUBLIC_BASE_URL_MERGED);
requireEnv("R2_PUBLIC_BASE_URL_CHUNKS", PUBLIC_BASE_URL_CHUNKS);

const trimRight = (s) => String(s).replace(/\/+$/, "");
const trimLeft = (s) => String(s).replace(/^\/+/, "");
const joinUrl = (a, b) => `${trimRight(a)}/${trimLeft(b)}`;

function normalizeUrls(items) {
  if (!Array.isArray(items)) throw new Error("mergeProcessor: input must be array");
  const out = items
    .map((x) => {
      if (typeof x === "string") return x;
      if (x?.url) return x.url;
      if (x?.key) return joinUrl(PUBLIC_BASE_URL_CHUNKS, x.key);
      return null;
    })
    .filter(Boolean)
    .map(String);
  if (out.length === 0) throw new Error("mergeProcessor: no valid URLs to merge");
  return out;
}

function writeConcatListFile(urls) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "merge-"));
  const listPath = path.join(tmpDir, "list.txt");
  const safe = (u) => u.replace(/'/g, "'\\''");
  const content = urls.map((u) => `file '${safe(u)}'`).join("\n");
  fs.writeFileSync(listPath, content, "utf8");
  return { tmpDir, listPath };
}

// ---------- ffmpeg binary resolution with blacklisting ----------
let cachedChoices = null;
const blacklist = new Set();

async function resolveCandidates() {
  if (cachedChoices) return cachedChoices;
  const candidates = [];

  // Prefer @ffmpeg-installer/ffmpeg
  try {
    const inst = await import("@ffmpeg-installer/ffmpeg");
    if (inst?.path && fs.existsSync(inst.path)) {
      fs.accessSync(inst.path, fs.constants.X_OK);
      candidates.push({ label: "@ffmpeg-installer/ffmpeg", path: inst.path });
    }
  } catch (e) {
    warn(`@ffmpeg-installer/ffmpeg not available: ${e.message}`);
  }

  // Then system ffmpeg
  candidates.push({ label: "system ffmpeg", path: "ffmpeg" });

  // Last resort: ffmpeg-static (prone to SIGSEGV on some stacks)
  try {
    const staticPath = (await import("ffmpeg-static")).default;
    if (staticPath && fs.existsSync(staticPath)) {
      fs.accessSync(staticPath, fs.constants.X_OK);
      candidates.push({ label: "ffmpeg-static", path: staticPath });
    }
  } catch (e) {
    // ignore
  }

  cachedChoices = candidates;
  return candidates;
}

async function findFfmpeg() {
  const candidates = await resolveCandidates();
  const usable = candidates.find((c) => !blacklist.has(c.label));
  if (!usable) throw new Error("No usable ffmpeg binary found (all candidates blacklisted).");
  info(`Using ${usable.label} binary`);
  return usable;
}

// ---------- run ffmpeg with re-encode (stable) ----------
async function runConcatEncode(listPath) {
  const { label, path: ffmpegPath } = await findFfmpeg();
  const outPath = path.join(path.dirname(listPath), "merged.mp3");

  return new Promise((resolve, reject) => {
    // Re-encode to MP3 to normalize all chunks; avoids -c copy mux issues
    const args = [
      "-hide_banner",
      "-loglevel", "error",
      "-protocol_whitelist", "file,http,https,tcp,tls,crypto",
      "-f", "concat",
      "-safe", "0",
      "-i", listPath,
      "-vn",
      "-acodec", "libmp3lame",
      "-b:a", process.env.MERGE_MP3_BITRATE || "160k",
      "-ar", process.env.MERGE_MP3_AR || "44100",
      "-ac", process.env.MERGE_MP3_CHANNELS || "2",
      "-y",
      outPath,
    ];

    const ff = spawn(ffmpegPath, args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderrLog = "";

    ff.stderr.on("data", (d) => {
      const msg = d.toString();
      stderrLog += msg;
      if (msg.toLowerCase().includes("error")) error(`ffmpeg stderr: ${msg.trim()}`);
    });

    ff.on("error", (err) => {
      error(`ffmpeg spawn error: ${err.message}`);
      // Blacklist the binary on spawn error
      blacklist.add(label);
      reject(new Error(`ffmpeg spawn failed (${label}): ${err.message}`));
    });

    ff.on("close", (code, signal) => {
      if (code === 0) {
        try {
          const st = fs.statSync(outPath);
          if (st.size <= 0) return reject(new Error("ffmpeg produced empty output file"));
          return resolve({ outPath, label });
        } catch (e) {
          return reject(new Error(`Output file missing: ${e.message}`));
        }
      }
      const reason = signal
        ? `ffmpeg terminated by signal ${signal}`
        : `ffmpeg exited with code ${code}`;
      error(`ffmpeg failed: ${reason}`);
      // Blacklist this binary if it segfaults / closes abnormally
      blacklist.add(label);
      const details = stderrLog.trim() ? ` — ${stderrLog.trim()}` : "";
      reject(new Error(`${reason}${details ? ` | ${details}` : ""}`));
    });
  });
}

// ---------- public API ----------
export async function mergeProcessor(sessionId, inputs, outputKeyOpt) {
  const keepAliveId = `mergeProcessor:${sessionId}`;
  const keep = startKeepAlive(keepAliveId, 15_000, "🔋 merge keep-alive");
  const urls = normalizeUrls(inputs);
  info({ count: urls.length }, "🎯 Merge URL list prepared");

  const outputKey = outputKeyOpt || `${sessionId}/merged.mp3`;
  const { tmpDir, listPath } = writeConcatListFile(urls);

  try {
    info("🎛️ Launching ffmpeg concat");

    // Try up to 3 different binaries (installer -> system -> static) via retries
    const { outPath, label } = await withRetries(
      () => runConcatEncode(listPath),
      { retries: 3, delay: 2500, label: "ffmpeg:concat" }
    );

    // Upload as stream to keep memory low
    await putObject(
      MERGED_BUCKET,
      outputKey,
      fs.createReadStream(outPath),
      "audio/mpeg"
    );

    const publicUrl = `${trimRight(PUBLIC_BASE_URL_MERGED)}/${encodeURIComponent(outputKey)}`;
    info({ outputKey, publicUrl, ffmpeg: label }, "✅ Merge complete & uploaded");

    return { key: outputKey, url: publicUrl };
  } catch (err) {
    error("💥 Streamed mergeProcessor failed", {
      service: "ai-podcast-suite",
      sessionId,
      err: err.message || String(err),
    });
    throw err;
  } finally {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch (e) {
      warn(`Temp cleanup failed: ${e.message}`);
    }
    stopKeepAlive(keep);
    info("⏳Keep-alive stopped.", { service: "ai-podcast-suite", sessionId });
  }
}

export default { mergeProcessor };
