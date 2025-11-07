// /services/tts/index.js
// Gemini 2.5 TTS – unified, REST-based, Gemini-only
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import fetch from "node-fetch";

const API_KEY = process.env.GEMINI_API_KEY;
if (!API_KEY) throw new Error("Missing GEMINI_API_KEY in environment");

export const DEFAULT_VOICE_NAME = process.env.GEMINI_TTS_VOICE || "Charon";
const TTS_API_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent";

/**
 * Generate speech for a single text payload and return a local PCM path.
 * (Upstream code converts PCM to MP3 using ffmpeg if needed.)
 * @param {string} text
 * @param {{voiceName?: string, filename?: string}} options
 */
export async function generateSpeech(text, { voiceName = DEFAULT_VOICE_NAME, filename } = {}) {
  if (!text || typeof text !== "string") throw new Error("text must be a non-empty string");

  const payload = {
    model: "gemini-2.5-flash-preview-tts",
    contents: [{ parts: [{ text }] }],
    generationConfig: {
      responseModalities: ["AUDIO"],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: { voiceName }
        }
      }
    }
  };

  const url = `${TTS_API_URL}?key=${encodeURIComponent(API_KEY)}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    const msg = await res.text().catch(() => "");
    throw new Error(`Gemini TTS error ${res.status}: ${msg.slice(0, 300)}`);
  }

  const json = await res.json();
  const inline = json.candidates?.[0]?.content?.parts?.find(p => p.inline_data);
  if (!inline?.inline_data?.data) throw new Error("No audio returned from Gemini TTS");

  // The API returns PCM; we store it to file as .pcm for upstream conversion when needed.
  const data = Buffer.from(inline.inline_data.data, "base64");
  const tmpPath = path.join(os.tmpdir(), filename || `tts-${Date.now()}.pcm`);
  await fs.writeFile(tmpPath, data);
  return tmpPath;
}

export default { generateSpeech, DEFAULT_VOICE_NAME };
