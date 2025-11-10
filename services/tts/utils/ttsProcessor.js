// services/tts/utils/ttsProcessor.js
// ============================================================
// 🔊 Gemini 2.5 Flash TTS Processor — fixed request schema
// ============================================================

import fs from "fs";
import path from "path";
import fetch from "node-fetch";
import pLimit from "p-limit";
import { info, error } from "#logger.js";
import { uploadBuffer, listKeys } from "#shared/r2-client.js";

const TMP_DIR = "/tmp/podcast_tts";
const TTS_API_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent";
const API_KEY = process.env.GEMINI_API_KEY;
const VOICE = process.env.GEMINI_TTS_VOICE || "Charon";
const LANGUAGE = process.env.GEMINI_TTS_LANGUAGE || "en-GB";

if (!API_KEY) throw new Error("❌ Missing GEMINI_API_KEY for TTS");

function b64PlainText(s) {
  return Buffer.from(s, "utf8").toString("base64");
}

export async function ttsProcessor(sessionId) {
  info({ sessionId }, "🎙 Starting full TTS orchestration pipeline");

  const tmpDir = path.join(TMP_DIR, sessionId);
  fs.mkdirSync(tmpDir, { recursive: true });

  try {
    // 1) discover text chunk keys in raw-text/<sessionId>/
    const textBucket = "raw-text";
    const textKeys = await listKeys(textBucket, `${sessionId}/`);
    if (!textKeys?.length) throw new Error("No text chunks found in R2.");
    info({ sessionId, count: textKeys.length }, "🧩 Retrieved text chunks for TTS");

    const limit = pLimit(1); // serialize to avoid hitting rate limits
    const audioUrls = [];

    await Promise.all(
      textKeys.map((key, idx) =>
        limit(async () => {
          // fetch chunk text
          const textUrl = `${process.env.R2_PUBLIC_BASE_URL_RAW_TEXT.replace(/\/$/, "")}/${key}`;
          const res = await fetch(textUrl);
          if (!res.ok) throw new Error(`Failed to fetch text chunk: ${textUrl}`);
          const raw = await res.text();
          const cleaned = raw.replace(/<[^>]*>/g, "").trim();

          // 2) correct Gemini TTS request body (inlineData + audioEncoding)
          const body = {
            contents: [
              {
                role: "user",
                parts: [
                  {
                    inlineData: {
                      mimeType: "text/plain",
                      data: b64PlainText(cleaned),
                    },
                  },
                ],
              },
            ],
            generationConfig: {
              audioConfig: {
                voiceConfig: {
                  voiceName: VOICE,
                  languageCode: LANGUAGE,
                },
                audioEncoding: "MP3",
              },
            },
          };

          const resp = await fetch(`${TTS_API_URL}?key=${API_KEY}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          });

          if (!resp.ok) {
            const text = await resp.text().catch(() => "");
            throw new Error(`TTS API failed: ${resp.status} ${resp.statusText} ${text}`);
          }

          const data = await resp.json();
          const audioBase64 =
            data?.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
          if (!audioBase64) throw new Error("No audio data returned by TTS.");

          const audioBuffer = Buffer.from(audioBase64, "base64");

          // 3) upload mp3 chunk to podcast-chunks/<sessionId>/tts/...
          const audioKey = `${sessionId}/tts/chunk_${idx + 1}.mp3`;
          await uploadBuffer("podcast-chunks", audioKey, audioBuffer, "audio/mpeg");

          // public URL for merge step
          const publicBase = process.env.R2_PUBLIC_BASE_URL_RAW || process.env.R2_PUBLIC_BASE_URL_PODCAST || "";
          audioUrls.push(`${publicBase.replace(/\/$/, "")}/${audioKey}`);

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

export default ttsProcessor;
