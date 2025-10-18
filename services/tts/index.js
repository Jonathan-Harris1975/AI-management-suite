// /services/tts/index.js
// Gemini 2.5 TTS Integration — October 2025

import fs from "node:fs/promises";
import path from "node:path";
import { GoogleGenerativeAI } from "@google/generative-ai";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
if (!GEMINI_API_KEY) throw new Error("Missing GEMINI_API_KEY in environment");

const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

/**
 * Generate speech from text using Gemini 2.5's TTS model.
 * @param {string} text - Text input to synthesize.
 * @param {object} [options]
 * @param {string} [options.voice="en-GB-Standard-D"] - Voice preset.
 * @param {string} [options.output="output.mp3"] - Output filename.
 * @returns {Promise<string>} Path to generated MP3.
 */
export async function generateSpeech(text, options = {}) {
  const voice = options.voice || "en-GB-Standard-D";
  const output = options.output || `tts-${Date.now()}.mp3`;
  const outputPath = path.join("/tmp", output);

  const model = genAI.getGenerativeModel({
    model: "gemini-2.5-tts",
  });

  const result = await model.generateContent({
    contents: [{ role: "user", parts: [{ text }] }],
    generationConfig: {
      responseMimeType: "audio/mp3",
      voiceConfig: { voice },
    },
  });

  const audioData = result.response.candidates?.[0]?.content?.parts?.[0]?.data;
  if (!audioData) throw new Error("No audio data returned from Gemini TTS");

  const buffer = Buffer.from(audioData, "base64");
  await fs.writeFile(outputPath, buffer);

  return outputPath;
}
