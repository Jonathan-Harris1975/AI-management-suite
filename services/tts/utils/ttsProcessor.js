// services/tts/utils/ttsProcessor.js
// ============================================================
// 🔊 Robust Gemini TTS Processor
// - Lists text from raw-text/<sid>/chunk-*.txt
// - Synthesizes with GoogleGenerativeAI (Gemini TTS)
// - Uploads MP3 to podcast-chunks/<sid>/tts/
// - Returns array of PUBLIC chunk URLs
// - Adds per-chunk timeout + defensive logging
// ============================================================

import { GoogleGenerativeAI } from "@google/generative-ai";
import pLimit from "p-limit";
import { info, error } from "#logger.js";
import { listKeys, uploadBuffer, buildPublicUrl } from "#shared/r2-client.js";
import { startHeartbeat, stopHeartbeat } from "#shared/heartbeat.js";

const API_KEY   = process.env.GEMINI_API_KEY;
const MODEL_ID  = process.env.GEMINI_TTS_MODEL || "gemini-2.5-pro-preview-tts";
const VOICE     = process.env.GEMINI_TTS_VOICE || "Charon";

// Bucket aliases (see r2-client ensureBucketKey mapping)
// rawtext -> R2_BUCKET_RAW_TEXT (e.g., 'raw-text')
// raw     -> R2_BUCKET_RAW       (e.g., 'podcast-chunks')
const TEXT_BUCKET_ALIAS  = "rawtext";
const AUDIO_BUCKET_ALIAS = "raw";

const CHUNK_TIMEOUT_MS = 45_000;          // fail fast per chunk
const CONCURRENCY      = Number(process.env.TTS_CONCURRENCY || );

function assertEnv() {
  if (!API_KEY) throw new Error("GEMINI_API_KEY is missing");
}

function abortableTimeout(ms) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return { controller, timer };
}

export async function ttsProcessor(sessionId) {
  assertEnv();
  startHeartbeat(`ttsProcessor:${sessionId}`, 25_000);
  info({ sessionId, model: MODEL_ID, voice: VOICE, concurrency: CONCURRENCY }, "🎙 TTS processor start");

  try {
    // 1) Discover raw text chunks for this session
    const prefix = `${sessionId}/`;
    const keys = await listKeys(TEXT_BUCKET_ALIAS, prefix);
    const textKeys = (keys || [])
      .filter(k => /chunk-\d+\.txt$/i.test(k))
      .sort((a, b) => {
        const ai = parseInt(a.match(/chunk-(\d+)\.txt$/i)[1], 10);
        const bi = parseInt(b.match(/chunk-(\d+)\.txt$/i)[1], 10);
        return ai - bi;
      });

    if (!textKeys.length) {
      throw new Error(`No text chunks found in ${TEXT_BUCKET_ALIAS}:${prefix}`);
    }
    info({ sessionId, count: textKeys.length }, "📝 Text chunks discovered");

    // 2) Init Gemini client
    const genAI = new GoogleGenerativeAI(API_KEY);
    // New-style TTS models expose generateContent with audio parts
    const limit = pLimit(CONCURRENCY);

    const outputs = [];
    let produced = 0;

    await Promise.all(
      textKeys.map((key, idx) =>
        limit(async () => {
          const i = idx + 1;
          const { controller, timer } = abortableTimeout(CHUNK_TIMEOUT_MS);
          try {
            // Fetch text via signed public URL (no need here — we just use buildPublicUrl + fetch)
            const url = buildPublicUrl(TEXT_BUCKET_ALIAS, key);
            const res = await fetch(url);
            const text = (await res.text()).trim();
            if (!text) throw new Error("Empty text chunk");

            const model = genAI.getGenerativeModel({ model: MODEL_ID, generationConfig: { voiceConfig: { voiceName: VOICE }}});
            const result = await model.generateContent(
              [{ text }],
              { signal: controller.signal }
            );

            clearTimeout(timer);

            // Parse audio
            const parts = result?.response?.candidates?.[0]?.content?.parts || result?.response?.content?.parts || [];
            const audioPart = parts.find(p => p.inlineData?.mimeType?.startsWith("audio/"));
            const b64 = audioPart?.inlineData?.data;
            if (!b64) throw new Error("Gemini returned no audio data");

            const buf = Buffer.from(b64, "base64");
            const outKey = `${sessionId}/tts/chunk_${i}.mp3`;
            await uploadBuffer(AUDIO_BUCKET_ALIAS, outKey, buf, "audio/mpeg");

            // Public URL for chunks should come from the RAW (podcast-chunks) public base
            const publicUrl = buildPublicUrl(AUDIO_BUCKET_ALIAS, outKey);
            outputs.push(publicUrl);
            produced += 1;

            info({ sessionId, index: i, bytes: buf.length }, "tts.chunk.done");
          } catch (e) {
            clearTimeout(timer);
            error({ sessionId, index: i, error: e?.message || String(e) }, "tts.chunk.failed");
          }
        })
      )
    );

    stopHeartbeat();

    if (!produced) {
      throw new Error("No TTS chunks were produced");
    }
    info({ sessionId, chunks: produced }, "✅ TTS chunks generated");
    return outputs;
  } catch (err) {
    error({ sessionId, error: err?.stack || err?.message }, "💥 TTS processor failed");
    stopHeartbeat();
    throw err;
  }
}

export default ttsProcessor;
