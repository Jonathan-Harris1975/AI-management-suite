// services/tts/utils/ttsProcessor.js
// ============================================================
// 🔊 Gemini 2.5 Flash TTS Processor — fully functional version
// ============================================================

import fs from "fs";
import path from "path";
import fetch from "node-fetch";
import pLimit from "p-limit";
import { info, error } from "#logger.js";
import { uploadBuffer, listKeys, getObjectAsText } from "#shared/r2-client.js";

const TMP_DIR = "/tmp/podcast_tts";
const TTS_API_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent";
const API_KEY = process.env.GEMINI_API_KEY;
const VOICE = process.env.GEMINI_TTS_VOICE || "Charon";
const LANGUAGE = process.env.GEMINI_TTS_LANGUAGE || "en-GB";

if (!API_KEY) throw new Error("❌ Missing GEMINI_API_KEY for TTS");

// ------------------------------------------------------------
// 🧩 Generate TTS Audio for all text chunks
// ------------------------------------------------------------
export async function ttsProcessor(sessionId) {
  info({ sessionId }, "🎙 Starting full TTS orchestration pipeline");

  const tmpDir = path.join(TMP_DIR, sessionId);
  fs.mkdirSync(tmpDir, { recursive: true });

  try {
    const bucket = "rawtext";
    const keys = await listKeys(bucket, `${sessionId}/`);
    if (!keys?.length) throw new Error("No text chunks found in R2.");

    const urls = keys.map(
      (k) => `${process.env.R2_PUBLIC_BASE_URL_RAW_TEXT.replace(/\/$/, "")}/${k}`
    );
    info({ sessionId, count: urls.length }, "🧩 Retrieved text chunks for TTS");

    const limit = pLimit(1);
    const audioUrls = [];

    await Promise.all(
      urls.map((url, idx) =>
        limit(async () => {
          const res = await fetch(url);
          const text = await res.text();
          const cleaned = text.replace(/<[^>]*>/g, "").trim();

          const body = {
            contents: [{ role: "user", parts: [{ text: cleaned }] }],
            generationConfig: {
              audioConfig: {
                voiceConfig: {
                  voiceName: VOICE,
                  languageCode: LANGUAGE,
                },
              },
            },
          };

          const resp = await fetch(`${TTS_API_URL}?key=${API_KEY}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          });

          if (!resp.ok) throw new Error(`TTS API failed: ${resp.statusText}`);
          const data = await resp.json();

          const audioBase64 =
            data?.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
          if (!audioBase64) throw new Error("No audio data returned.");

          const audioBuffer = Buffer.from(audioBase64, "base64");
          const key = `${sessionId}/tts/chunk_${idx + 1}.mp3`;
          await uploadBuffer("podcast-chunks", key, audioBuffer, "audio/mpeg");

          audioUrls.push(
            `${process.env.R2_PUBLIC_BASE_URL_RAW.replace(/\/$/, "")}/${key}`
          );

          info({ sessionId, index: idx + 1, bytes: audioBuffer.length }, "tts.chunk.done");
        })
      )
    );

    info({ sessionId, chunks: audioUrls.length }, "✅ TTS chunks generated");
    return audioUrls;
  } catch (err) {
    error({ sessionId, error: err.message }, "💥 TTS orchestration failed");
    throw err;
  }
}
