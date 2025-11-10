// services/tts/utils/ttsProcessor.js
// ============================================================
// 🔊 Gemini 2.5 Pro Preview TTS Processor (Studio-compatible)
// - Uses @google/generative-ai SDK
// - Reads text from raw-text/<sid>/, uploads MP3 to podcast-chunks/<sid>/tts/
// ============================================================

import { GoogleGenerativeAI } from "@google/generative-ai";
import pLimit from "p-limit";
import { info, error } from "#logger.js";
import { listKeys, uploadBuffer } from "#shared/r2-client.js";

const API_KEY = process.env.GEMINI_API_KEY;
const MODEL_ID = process.env.GEMINI_TTS_MODEL || "gemini-2.5-pro-preview-tts";
const VOICE = process.env.GEMINI_TTS_VOICE || "Charon";
const TEXT_BUCKET = "rawtext";
const AUDIO_BUCKET = "raw";

const RAW_TEXT_BASE = (process.env.R2_PUBLIC_BASE_URL_RAW_TEXT || "").replace(/\/$/, "");
const AUDIO_BASE = (process.env.R2_PUBLIC_BASE_URL_PODCAST || process.env.R2_PUBLIC_BASE_URL_RAW || "").replace(/\/$/, "");

if (!API_KEY) throw new Error("❌ Missing GEMINI_API_KEY for TTS");

const genAI = new GoogleGenerativeAI(API_KEY);
const model = genAI.getGenerativeModel({ model: MODEL_ID });

// simple text cleaner
const clean = (txt) =>
  String(txt || "")
    .replace(/<[^>]*>/g, "")
    .replace(/\s+/g, " ")
    .trim();

export async function ttsProcessor(sessionId) {
  const sid = sessionId || `TT-${Date.now()}`;
  info({ sessionId: sid }, "🎙 TTS processor start");

  try {
    const textKeys = await listKeys(TEXT_BUCKET, `${sid}/`);
    if (!textKeys?.length)
      throw new Error(`No text chunks found in r2://${TEXT_BUCKET}/${sid}/`);

    const limiter = pLimit(1);
    const audioUrls = [];

    await Promise.all(
      textKeys.map((key, i) =>
        limiter(async () => {
          const textUrl = `${RAW_TEXT_BASE}/${key}`;
          const res = await fetch(textUrl);
          if (!res.ok) throw new Error(`Failed to fetch ${textUrl}`);
          const input = clean(await res.text());

          // Studio-spec config
          const generationConfig = {
            responseModalities: ["AUDIO"],
            temperature: 1,
            speech_config: {
              voice_config: {
                prebuilt_voice_config: {
                  voice_name: VOICE,
                },
              },
            },
          };

          const result = await model.generateContent({
            contents: [{ role: "user", parts: [{ text: input }] }],
            generationConfig,
          });

          const parts = result?.response?.candidates?.[0]?.content?.parts || [];
          const audioPart = parts.find((p) => p.inlineData?.mimeType?.startsWith("audio/"));
          if (!audioPart?.inlineData?.data)
            throw new Error("Gemini returned no audio data");

          const buf = Buffer.from(audioPart.inlineData.data, "base64");
          const outKey = `${sid}/tts/chunk_${i + 1}.mp3`;
          await uploadBuffer(AUDIO_BUCKET, outKey, buf, "audio/mpeg");

          const url = `${AUDIO_BASE}/${outKey}`;
          audioUrls.push(url);
          info({ sessionId: sid, index: i + 1, bytes: buf.length }, "tts.chunk.done");
        })
      )
    );

    info({ sessionId: sid, chunks: audioUrls.length }, "✅ TTS chunks generated");
    return audioUrls;
  } catch (err) {
    error({ sessionId: sid, error: err.message }, "💥 TTS processor failed");
    throw err;
  }
}

export default ttsProcessor;
