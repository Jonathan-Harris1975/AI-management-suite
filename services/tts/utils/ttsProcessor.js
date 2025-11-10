// services/tts/utils/ttsProcessor.js
// ============================================================
// 🔊 Gemini 2.5 Pro TTS Processor (streamGenerateContent)
// - Uses official @google/generative-ai client
// - Mirrors Google Studio syntax (generationConfig.speech_config)
// - Streams MP3 output and uploads to R2
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

if (!API_KEY) throw new Error("❌ Missing GEMINI_API_KEY for TTS");

const genAI = new GoogleGenerativeAI(API_KEY);
const model = genAI.getGenerativeModel({ model: MODEL_ID });

// R2 base URLs
const RAW_BASE = (process.env.R2_PUBLIC_BASE_URL_RAW_TEXT || "").replace(/\/$/, "");
const AUDIO_BASE = (process.env.R2_PUBLIC_BASE_URL_PODCAST || process.env.R2_PUBLIC_BASE_URL_RAW || "").replace(/\/$/, "");

export async function ttsProcessor(sessionId) {
  const sid = sessionId || `TT-${Date.now()}`;
  info({ sessionId: sid }, "🎙 Starting full TTS orchestration pipeline");

  try {
    // 1️⃣ Fetch list of text chunks from R2
    const textKeys = await listKeys(TEXT_BUCKET, `${sid}/`);
    if (!textKeys?.length)
      throw new Error(`No text chunks found in r2://${TEXT_BUCKET}/${sid}/`);

    const limit = pLimit(1);
    const audioUrls = [];

    await Promise.all(
      textKeys.map((key, idx) =>
        limit(async () => {
          const textUrl = `${RAW_BASE}/${key}`;
          const res = await fetch(textUrl);
          if (!res.ok) throw new Error(`Failed to fetch text chunk: ${textUrl}`);
          const cleaned = (await res.text()).replace(/<[^>]*>/g, "").trim();

          // 2️⃣ Build Gemini TTS config
          const generationConfig = {
            responseModalities: ["AUDIO"],
            temperature: 1,
            speech_config: {
              voice_config: {
                prebuilt_voice_config: { voice_name: VOICE },
              },
            },
          };

          // 3️⃣ Call the API
          const result = await model.generateContent({
            contents: [
              {
                role: "user",
                parts: [{ text: cleaned }],
              },
            ],
            generationConfig,
          });

          const audioPart = result.response?.candidates?.[0]?.content?.parts?.find(
            (p) => p.inlineData?.mimeType?.includes("audio")
          );

          if (!audioPart?.inlineData?.data)
            throw new Error("No audio data returned by Gemini TTS");

          const audioBuf = Buffer.from(audioPart.inlineData.data, "base64");
          const outKey = `${sid}/tts/chunk_${idx + 1}.mp3`;
          await uploadBuffer(AUDIO_BUCKET, outKey, audioBuf, "audio/mpeg");

          const publicUrl = `${AUDIO_BASE}/${outKey}`;
          audioUrls.push(publicUrl);

          info(
            { sessionId: sid, index: idx + 1, bytes: audioBuf.length },
            "tts.chunk.done"
          );
        })
      )
    );

    info({ sessionId: sid, chunks: audioUrls.length }, "✅ TTS chunks generated");
    return audioUrls;
  } catch (err) {
    error({ sessionId: sessionId, error: err.message }, "💥 TTS orchestration failed");
    throw err;
  }
}

export default ttsProcessor;
