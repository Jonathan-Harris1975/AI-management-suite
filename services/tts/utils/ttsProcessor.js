// services/tts/utils/ttsProcessor.js
// ============================================================
// 🔊 Gemini 2.5 Flash TTS Processor — fixed request schema
// - Pulls text chunks from R2 (raw-text/<sessionId>/...)
// - Calls Gemini TTS (root-level audioConfig; inlineData base64)
// - Uploads MP3 chunks to R2 (podcast-chunks/<sessionId>/tts/...)
// - Returns PUBLIC HTTPS URLs for mergeProcessor
// ============================================================

import fetch from "node-fetch";
import pLimit from "p-limit";
import { info, error } from "#logger.js";
import { listKeys, uploadBuffer } from "#shared/r2-client.js";

const API_KEY = process.env.GEMINI_API_KEY;
const TTS_MODEL =
  process.env.GEMINI_TTS_MODEL || "gemini-2.5-flash-preview-tts";
const TTS_API_URL =
  `https://generativelanguage.googleapis.com/v1beta/models/${TTS_MODEL}:generateContent`;

const VOICE   = process.env.GEMINI_TTS_VOICE    || "Charon";
const LANG    = process.env.GEMINI_TTS_LANGUAGE || "en-GB";
const CHUNK_BUCKET = "raw";   // audio output
const TEXT_BUCKET  = "rawtext";         // text input

// Prefer podcast public base for audio; fall back to RAW if not set
function baseUrlForAudio() {
  const a = (process.env.R2_PUBLIC_BASE_URL_PODCAST || "").trim();
  const b = (process.env.R2_PUBLIC_BASE_URL_RAW     || "").trim();
  return (a || b).replace(/\/$/, "");
}
function baseUrlForText() {
  const t = (process.env.R2_PUBLIC_BASE_URL_RAW_TEXT || "").trim();
  return t.replace(/\/$/, "");
}

if (!API_KEY) {
  throw new Error("❌ Missing GEMINI_API_KEY for TTS");
}

function b64PlainText(s) {
  return Buffer.from(s, "utf8").toString("base64");
}

export async function ttsProcessor(sessionId) {
  const sid = sessionId || `TT-${Date.now()}`;
  info({ sessionId: sid }, "🎙 Starting full TTS orchestration pipeline");

  try {
    // 1) discover text chunks in raw-text/<sid>/
    const textKeys = await listKeys(TEXT_BUCKET, `${sid}/`);
    if (!textKeys?.length) throw new Error(`No text chunks found in r2://${TEXT_BUCKET}/${sid}/`);

    const textBase = baseUrlForText();
    const audioBase = baseUrlForAudio();
    const limit = pLimit(1); // serialize to keep API happy
    const audioUrls = [];

    await Promise.all(
      textKeys.map((key, idx) =>
        limit(async () => {
          // GET raw text
          const textUrl = `${textBase}/${key}`;
          const res = await fetch(textUrl);
          if (!res.ok) throw new Error(`Failed to fetch text chunk: ${textUrl}`);
          const raw = await res.text();
          const cleaned = raw.replace(/<[^>]*>/g, "").trim();

          // 2) Correct Gemini 2.5 TTS body: root-level audioConfig + inlineData
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
            audioConfig: {
              voiceConfig: { voiceName: VOICE, languageCode: LANG },
              audioEncoding: "MP3",
            },
          };

          const resp = await fetch(`${TTS_API_URL}?key=${API_KEY}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          });

          if (!resp.ok) {
            const detail = await resp.text().catch(() => "");
            throw new Error(`TTS API failed: ${resp.status} ${resp.statusText} ${detail}`);
          }

          const data = await resp.json();
          const audioB64 = data?.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
          if (!audioB64) throw new Error("No audio data returned by TTS.");

          const audioBuf = Buffer.from(audioB64, "base64");
          const outKey = `${sid}/tts/chunk_${idx + 1}.mp3`;

          await uploadBuffer(CHUNK_BUCKET, outKey, audioBuf, "audio/mpeg");
          const publicUrl = `${audioBase}/${outKey}`;
          audioUrls.push(publicUrl);

          info({ sessionId: sid, index: idx + 1, bytes: audioBuf.length }, "tts.chunk.done");
        })
      )
    );

    info({ sessionId: sid, chunks: audioUrls.length }, "✅ TTS chunks generated");
    return audioUrls;
  } catch (err) {
    error({ sessionId: sid, error: err.message }, "💥 TTS orchestration failed");
    throw err;
  }
}

export default ttsProcessor;
