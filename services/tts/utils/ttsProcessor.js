// services/tts/utils/ttsProcessor.js
// ============================================================
// 🎙 Amazon Polly TTS Processor (Public URL Mode)
//   - Fetches text chunks from public R2 URLs
//   - Synthesizes audio with Amazon Polly (Neural)
//   - Logs full summary + heartbeat
// ============================================================

import { PollyClient, SynthesizeSpeechCommand } from "@aws-sdk/client-polly";
import { info, error } from "#logger.js";
import fetch from "node-fetch";
import fs from "fs/promises";
import path from "path";
import { startHeartbeat, stopHeartbeat } from "#shared/heartbeat.js";

const REGION = process.env.AWS_REGION || "eu-west-2";
const VOICE = process.env.POLLY_VOICE_ID || "Brian";
const MODEL = "Amazon Polly (Neural)";
const TMP_DIR = "/tmp/tts";
await fs.mkdir(TMP_DIR, { recursive: true });

const polly = new PollyClient({ region: REGION });

// ------------------------------------------------------------
// 🎧 synthesizeChunk()
// ------------------------------------------------------------
async function synthesizeChunk(sessionId, text, index) {
  const outFile = path.join(TMP_DIR, `${sessionId}-chunk-${String(index).padStart(3, "0")}.mp3`);
  const command = new SynthesizeSpeechCommand({
    OutputFormat: "mp3",
    Engine: "neural",
    Text: text,
    VoiceId: VOICE,
  });
  const res = await polly.send(command);
  const chunks = [];
  for await (const c of res.AudioStream) chunks.push(c);
  await fs.writeFile(outFile, Buffer.concat(chunks));
  return outFile;
}

// ------------------------------------------------------------
// 🧠 processTTS()
// ------------------------------------------------------------
export async function processTTS({ sessionId, chunks }) {
  const started = Date.now();
  info({ sessionId, model: MODEL, voice: VOICE, region: REGION }, "🎙 TTS Processor Start");
  startHeartbeat(`ttsProcessor:${sessionId}`);

  let success = 0;
  let fail = 0;
  let totalBytes = 0;

  for (const chunk of chunks) {
    try {
      const res = await fetch(chunk.url);
      if (!res.ok) throw new Error(`Fetch failed (${res.status})`);
      const text = await res.text();
      totalBytes += Buffer.byteLength(text, "utf8");
      const out = await synthesizeChunk(sessionId, text, chunk.index);
      const stats = await fs.stat(out);
      success++;
      info({ index: chunk.index, bytes: stats.size, url: chunk.url }, "✅ Chunk synthesized");
    } catch (err) {
      fail++;
      error({ sessionId, url: chunk.url, error: err.message }, "❌ TTS Chunk Failure");
    }
  }

  const elapsed = ((Date.now() - started) / 1000).toFixed(1) + "s";
  info(
    { sessionId, model: MODEL, voice: VOICE, region: REGION, chunksProcessed: chunks.length, success, failed: fail, totalBytes, elapsed },
    "🎧 TTS Summary"
  );
  stopHeartbeat(`ttsProcessor:${sessionId}`);
}

// ✅ Allow both default and named import
export const ttsProcessor = processTTS;
export default processTTS;
