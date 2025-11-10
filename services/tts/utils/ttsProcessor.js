// ============================================================
// 🔊 ttsProcessor.js — Robust chunk-level synthesis
// ============================================================

import { info, error } from "#logger.js";
import { getObject, putObject } from "#shared/r2-client.js";
import { startHeartbeat, stopHeartbeat } from "#shared/heartbeat.js";
import { textToSpeech } from "#shared/tts-client.js"; // your Gemini or Google wrapper

const BUCKET_RAW = "rawtext";
const BUCKET_CHUNKS = "raw";
const CHUNK_TIMEOUT = 45_000; // ms

export async function ttsProcessor(sessionId) {
  info({ sessionId }, "🎙 TTS processor start");
  startHeartbeat(`ttsProcessor:${sessionId}`, 25_000);

  try {
    // pull raw text chunks
    const prefix = `${sessionId}/`;
    const rawKeys = await getObject.list(BUCKET_RAW, prefix);
    if (!rawKeys?.length) throw new Error(`No raw-text found under ${prefix}`);

    const outputs = [];
    let index = 0;

    for (const key of rawKeys) {
      index++;
      const { Body } = await getObject(BUCKET_RAW, key);
      const text = Body.toString().trim();
      if (!text) continue;

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), CHUNK_TIMEOUT);

      try {
        const audio = await textToSpeech(text, { signal: controller.signal });
        clearTimeout(timer);

        if (!audio?.length) throw new Error("Empty audio buffer");
        const chunkKey = `${sessionId}/chunk-${index}.mp3`;

        await putObject(BUCKET_CHUNKS, chunkKey, audio, "audio/mpeg");
        outputs.push(`https://podcast-chunks.jonathan-harris.online/${encodeURIComponent(chunkKey)}`);

        info({ sessionId, index, bytes: audio.length, preview: text.slice(0, 80) + "..." }, "tts.chunk");
      } catch (e) {
        clearTimeout(timer);
        error({ sessionId, index, err: e.message }, "tts.chunk.failed");
        continue;
      }
    }

    stopHeartbeat();

    if (!outputs.length) throw new Error("No chunks produced");
    info({ sessionId, count: outputs.length }, "🎧 TTS generation complete");
    return outputs;
  } catch (err) {
    error({ sessionId, error: err.stack || err.message }, "ttsProcessor.failed");
    stopHeartbeat();
    throw err;
  }
      }
