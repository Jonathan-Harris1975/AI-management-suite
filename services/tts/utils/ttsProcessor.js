// services/tts/utils/ttsProcessor.js
// ============================================================
// 🔊 Gemini TTS Processor — Safe Conversion Edition
// ============================================================
// Uses google/tts-1 or google/tts-1-hq, validates returned type,
// and converts to MP3 if Gemini outputs raw audio or WAV.
// ============================================================

import { GoogleGenerativeAI } from "@google/generative-ai";
import pLimit from "p-limit";
import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import { info, error } from "#logger.js";
import { listKeys, uploadBuffer, buildPublicUrl } from "#shared/r2-client.js";
import { startHeartbeat, stopHeartbeat } from "#shared/heartbeat.js";

const API_KEY  = process.env.GEMINI_API_KEY;
const MODEL_ID = process.env.GEMINI_TTS_MODEL || "google/tts-1-hq";
const VOICE    = process.env.GEMINI_TTS_VOICE || "en-US-Neural2-F";

const TEXT_BUCKET  = "rawtext";
const AUDIO_BUCKET = "raw";
const TMP_DIR = "/tmp/tts_chunks";

const CHUNK_TIMEOUT_MS = 45_000;
const CONCURRENCY = Number(process.env.TTS_CONCURRENCY || 2);

if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR, { recursive: true });

// ------------------------------------------------------------
// Utility: decode + optional MP3 conversion
// ------------------------------------------------------------
async function ensureMp3(buffer, tmpName) {
  // Check file header: MP3 begins with "ID3" or 0xFF 0xFB
  if (buffer.slice(0, 3).toString() === "ID3" || buffer[0] === 0xff) return buffer;

  const input = path.join(TMP_DIR, `${tmpName}.raw`);
  const output = path.join(TMP_DIR, `${tmpName}.mp3`);
  fs.writeFileSync(input, buffer);

  try {
    execSync(`ffmpeg -y -f s16le -ar 24000 -ac 1 -i "${input}" -codec:a libmp3lame -q:a 2 "${output}"`);
    const mp3Buf = fs.readFileSync(output);
    return mp3Buf;
  } catch (e) {
    error({ tmpName, err: e.message }, "ffmpeg.convert.failed");
    throw new Error("FFmpeg conversion to MP3 failed");
  } finally {
    fs.rmSync(input, { force: true });
    if (fs.existsSync(output)) fs.rmSync(output, { force: true });
  }
}

// ------------------------------------------------------------
// Timeout helper
// ------------------------------------------------------------
function abortableTimeout(ms) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return { controller, timer };
}

// ------------------------------------------------------------
// Main processor
// ------------------------------------------------------------
export async function ttsProcessor(sessionId) {
  if (!API_KEY) throw new Error("Missing GEMINI_API_KEY");
  startHeartbeat(`ttsProcessor:${sessionId}`, 25_000);

  try {
    const prefix = `${sessionId}/`;
    const keys = await listKeys(TEXT_BUCKET, prefix);
    const textKeys = (keys || [])
      .filter(k => /chunk-\d+\.txt$/i.test(k))
      .sort((a, b) => parseInt(a.match(/\d+/)) - parseInt(b.match(/\d+/)));

    if (!textKeys.length) throw new Error(`No text chunks found in ${TEXT_BUCKET}:${prefix}`);
    info({ sessionId, count: textKeys.length }, "📝 Text chunks discovered");

    const genAI = new GoogleGenerativeAI(API_KEY);
    const ttsModel = genAI.getGenerativeModel({ model: MODEL_ID });
    const limit = pLimit(CONCURRENCY);
    const outputs = [];

    await Promise.all(
      textKeys.map((key, idx) =>
        limit(async () => {
          const i = idx + 1;
          const { controller, timer } = abortableTimeout(CHUNK_TIMEOUT_MS);
          try {
            const textUrl = buildPublicUrl(TEXT_BUCKET, key);
            const textRes = await fetch(textUrl);
            const text = (await textRes.text()).trim();
            if (!text) throw new Error("Empty text chunk");

            const result = await ttsModel.generateSpeech(
              { input: text, voice: VOICE, mimeType: "audio/mp3" },
              { signal: controller.signal }
            );

            clearTimeout(timer);

            const b64 = result?.audioContent || result?.audioData;
            if (!b64) throw new Error("Gemini returned no audio data");
            const rawBuf = Buffer.from(b64, "base64");

            // Convert to MP3 if needed
            const mp3Buf = await ensureMp3(rawBuf, `${sessionId}_${i}`);

            const outKey = `${sessionId}/tts/chunk_${i}.mp3`;
            await uploadBuffer(AUDIO_BUCKET, outKey, mp3Buf, "audio/mpeg");
            const publicUrl = buildPublicUrl(AUDIO_BUCKET, outKey);
            outputs.push(publicUrl);
            info({ sessionId, index: i, bytes: mp3Buf.length }, "tts.chunk.done");
          } catch (e) {
            clearTimeout(timer);
            error({ sessionId, index: i, error: e.message }, "tts.chunk.failed");
          }
        })
      )
    );

    stopHeartbeat();

    if (!outputs.length) throw new Error("No TTS chunks were produced");
    info({ sessionId, chunks: outputs.length }, "✅ TTS chunks generated");
    return outputs;
  } catch (err) {
    error({ sessionId, error: err.message }, "💥 TTS processor failed");
    stopHeartbeat();
    throw err;
  }
}

export default ttsProcessor;
