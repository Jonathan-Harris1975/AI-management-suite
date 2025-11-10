// services/tts/utils/ttsProcessor.js
// ============================================================
// 🔊 Amazon Polly TTS Processor — UK "Brian" Voice Edition
// ============================================================
// - Uses AWS Polly Neural TTS
// - Reads text from raw-text/<sid>/chunk-*.txt
// - Produces MP3s stored in podcast-chunks/<sid>/tts/
// - Includes per-chunk timeout, heartbeat, and detailed logs
// ============================================================

import { PollyClient, SynthesizeSpeechCommand } from "@aws-sdk/client-polly";
import fs from "fs";
import path from "path";
import pLimit from "p-limit";
import { info, error } from "#logger.js";
import { listKeys, uploadBuffer, buildPublicUrl } from "#shared/r2-client.js";
import { startHeartbeat, stopHeartbeat } from "#shared/heartbeat.js";

// ============================================================
// ⚙️ Polly Configuration
// ============================================================
const REGION = process.env.AWS_REGION || "eu-west-2"; // London
const VOICE_ID = process.env.POLLY_VOICE_ID || "Brian";
const CONCURRENCY = Number(process.env.TTS_CONCURRENCY || 2);
const TMP_DIR = "/tmp/polly_tts";

if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR, { recursive: true });

const polly = new PollyClient({ region: REGION });

// ============================================================
// 🧩 Helper: Per-Chunk Timeout Controller
// ============================================================
function abortableTimeout(ms) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return { controller, timer };
}

// ============================================================
// 🧠 Main Processor
// ============================================================
export async function ttsProcessor(sessionId) {
  startHeartbeat(`ttsProcessor:${sessionId}`, 25_000);
  info({ sessionId, voice: VOICE_ID, region: REGION, concurrency: CONCURRENCY }, "🎙 TTS processor start");

  try {
    const prefix = `${sessionId}/`;
    const textKeys = (await listKeys("rawtext", prefix))
      .filter(k => /chunk-\d+\.txt$/i.test(k))
      .sort((a, b) => parseInt(a.match(/\d+/)) - parseInt(b.match(/\d+/)));

    if (!textKeys.length) throw new Error(`No text chunks found in rawtext:${prefix}`);
    info({ sessionId, count: textKeys.length }, "📝 Text chunks discovered");

    const limit = pLimit(CONCURRENCY);
    const outputs = [];

    await Promise.all(
      textKeys.map((key, idx) =>
        limit(async () => {
          const i = idx + 1;
          const { controller, timer } = abortableTimeout(60_000); // 60s per chunk
          try {
            const textUrl = buildPublicUrl("rawtext", key);
            const res = await fetch(textUrl);
            const text = (await res.text()).trim();
            if (!text) throw new Error(`Empty text in ${key}`);

            const command = new SynthesizeSpeechCommand({
              OutputFormat: "mp3",
              Engine: "neural",
              LanguageCode: "en-GB",
              VoiceId: VOICE_ID,
              Text: text,
            });

            const response = await polly.send(command, { signal: controller.signal });
            clearTimeout(timer);

            // Stream to buffer
            const chunks = [];
            for await (const chunk of response.AudioStream) chunks.push(chunk);
            const buf = Buffer.concat(chunks);

            const outKey = `${sessionId}/tts/chunk_${i}.mp3`;
            await uploadBuffer("raw", outKey, buf, "audio/mpeg");
            const publicUrl = buildPublicUrl("raw", outKey);
            outputs.push(publicUrl);

            info({ sessionId, index: i, bytes: buf.length }, "tts.chunk.done");
          } catch (e) {
            clearTimeout(timer);
            error({ sessionId, index: i, error: e?.message || String(e) }, "tts.chunk.failed");
          }
        })
      )
    );

    stopHeartbeat();

    if (!outputs.length) throw new Error("No TTS chunks were produced");
    info({ sessionId, chunks: outputs.length }, "✅ TTS chunks generated");
    return outputs;
  } catch (err) {
    error({ sessionId, error: err?.stack || err?.message }, "💥 TTS processor failed");
    stopHeartbeat();
    throw err;
  }
}

export default ttsProcessor;
