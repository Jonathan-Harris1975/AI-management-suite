// ============================================================
// 🎬 TTS Orchestrator — Strict, Retriable Pipeline
// ============================================================
// - Lists text chunks from R2 raw-text
// - Runs TTS with mandatory success of all chunks
// - Merges via robust ffmpeg concat (with retries)
// - Proceeds to editing & podcast export
// ============================================================

import { info, error } from "#logger.js";
import { listKeys, putObject } from "#shared/r2-client.js";
import { ttsProcessor } from "./ttsProcessor.js";
import { mergeProcessor } from "./mergeProcessor.js";
import { editingProcessor } from "./editingProcessor.js";
import { podcastProcessor } from "./podcastProcessor.js";
import { startKeepAlive, stopKeepAlive } from "../../shared/utils/keepalive.js";

const RAW_TEXT_BUCKET = process.env.R2_BUCKET_RAW_TEXT;
const RAW_TEXT_BASE_URL = process.env.R2_PUBLIC_BASE_URL_RAW_TEXT;
const FINAL_BUCKET = process.env.R2_BUCKET_PODCAST || "podcast";
const PUBLIC_BASE_URL_PODCAST = process.env.R2_PUBLIC_BASE_URL_PODCAST;

function requireEnv(name, val){ if(!val) throw new Error(`Missing required env: ${name}`); }
requireEnv("R2_BUCKET_RAW_TEXT", RAW_TEXT_BUCKET);
requireEnv("R2_PUBLIC_BASE_URL_RAW_TEXT", RAW_TEXT_BASE_URL);
requireEnv("R2_BUCKET_PODCAST", FINAL_BUCKET);
requireEnv("R2_PUBLIC_BASE_URL_PODCAST", PUBLIC_BASE_URL_PODCAST);

function naturalSortKeys(keys){
  return keys.slice().sort((a,b)=>{
    const na = a.match(/(\d+)/g)?.map(Number) || [];
    const nb = b.match(/(\d+)/g)?.map(Number) || [];
    for (let i=0; i<Math.max(na.length, nb.length); i++){
      const da = na[i] ?? 0, db = nb[i] ?? 0;
      if (da !== db) return da - db;
    }
    return a.localeCompare(b);
  });
}

// ------------------------------------------------------------
// 🚀 Main Orchestration
// ------------------------------------------------------------
export async function orchestrateTTS(session) {
  const sessionId = typeof session === "object" && session?.sessionId ? session.sessionId : session;
  const t0 = Date.now();
  info({ sessionId }, "🎬 Orchestration begin");
  startKeepAlive("ttsProcessor", 120000);

  try {
    // 1) Discover text chunks
    info({ sessionId }, "🔍 Listing text chunks from R2...");
    const keys = await listKeys(RAW_TEXT_BUCKET, `${sessionId}/chunk-`);
    if (!keys?.length) throw new Error(`No .txt chunks found in R2 for session ${sessionId}`);

    const txtKeys = naturalSortKeys(keys).filter(k => k.endsWith(".txt"));
    const textChunks = txtKeys.map(k => ({
      key: k,
      url: `${RAW_TEXT_BASE_URL}/${encodeURIComponent(k)}`,
    }));

    info({ sessionId, count: textChunks.length }, "🧩 Text chunks collected");

    // Load raw texts from R2 (public base URL)
    const fetchFn = globalThis.fetch || (await import("node-fetch")).default;
    const texts = await Promise.all(textChunks.map(async ({url}, i) => {
      const res = await fetchFn(url);
      if (!res.ok) throw new Error(`Failed to download text chunk ${i+1}: ${res.status}`);
      return await res.text();
    }));

    // 2) TTS
    const t1 = Date.now();
    const ttsResults = await ttsProcessor(sessionId, texts);
    info({ sessionId, ms: Date.now()-t1 }, "🎙 TTS complete");

    // Validate contiguous indices
    const missing = [];
    for (let i=1; i<=ttsResults.length; i++){
      if (!ttsResults[i-1]?.success || ttsResults[i-1].index !== i) missing.push(i);
    }
    if (missing.length){
      throw new Error(`Missing audio chunks: [${missing.join(", ")}]`);
    }

    // 3) Merge
    const merged = await mergeProcessor(sessionId, ttsResults);
    if (!merged?.key) throw new Error("Merge step failed to produce an R2 key.");
    info({ sessionId, key: merged.key }, "🧩 Merge complete");

    // 4) Optional editing
    const editedBuffer = await editingProcessor(sessionId, merged);
    if (!editedBuffer?.length) throw new Error("Editing step returned no audio data.");
    info({ sessionId, bytes: editedBuffer.length }, "🎚 Editing complete");

    // 5) Final podcast output (intro/outro, metadata)
    const finalAudio = await podcastProcessor(sessionId, editedBuffer);
    if (!finalAudio?.length) throw new Error("Podcast step produced empty buffer.");
    info({ sessionId, bytes: finalAudio.length }, "📻 Podcast build complete");

    // 6) Upload final
    const key = `${sessionId}.mp3`;
    await putObject(FINAL_BUCKET, key, finalAudio, "audio/mpeg");
    const publicUrl = `${PUBLIC_BASE_URL_PODCAST}/${encodeURIComponent(key)}`;
    info({ sessionId, key, publicUrl, totalMs: Date.now() - t0 }, "💾 Uploaded final MP3 to R2");

    return { ok: true, sessionId, file: key, url: publicUrl };
  } catch (err) {
    error({ sessionId, error: err?.stack || err?.message }, "💥 TTS orchestration failed");
    throw err;
  } finally {
    stopKeepAlive("ttsProcessor");
  }
}

export default orchestrateTTS;
