// ============================================================
// 🖼️ Podcast Artwork Generator (OpenRouter Image Model)
// ============================================================
//
// NEW VERSION — supports Nano Banana, Gemini Flash Image, Flux, etc.
// Uses images.generate() instead of chat.completions.create()
// Guaranteed Base64 extraction
// ============================================================

import OpenAI from "openai";
import { warn, error } from "#logger.js";

// ------------------------------------------------------------
// 🔍 Required Environment Variables
// ------------------------------------------------------------
const REQUIRED = [
  "OPENROUTER_API_KEY_ART",
  "OPENROUTER_ART"  // model name for image generation
];

const missing = REQUIRED.filter(k => !process.env[k] || process.env[k].trim() === "");

if (missing.length > 0) {
  warn("⚠️ Artwork generator missing required environment variables", { missing });
}

// ------------------------------------------------------------
// ⚙️ Config
// ------------------------------------------------------------
const cfg = {
  key: process.env.OPENROUTER_API_KEY_ART || "",
  baseURL: "https://openrouter.ai/api/v1",
  model: process.env.OPENROUTER_ART || "google/gemini-2.5-flash-image-preview:exp",
};

const client = new OpenAI({
  apiKey: cfg.key,
  baseURL: cfg.baseURL,
});

// ------------------------------------------------------------
// 🎨 Generate Podcast Artwork (Base64 PNG)
// ------------------------------------------------------------
export async function generatePodcastArtwork(prompt) {
  if (!cfg.key || !cfg.model) {
    throw new Error("Artwork generation disabled: missing required OpenRouter env vars.");
  }

  try {
    // Modern OpenRouter Image API
    const result = await client.images.generate({
      model: cfg.model,
      prompt: `Create a 1400x1400 podcast cover art image. 
               Style: cinematic, vibrant, AI-themed. 
               Theme: "${prompt}". 
               Do NOT include any text.`,
      size: "1400x1400",
      response_format: "b64_json"
    });

    // Extract Base64 (standardised)
    const image = result.data?.[0]?.b64_json;
    if (!image) {
      throw new Error("Image generation returned no b64_json content.");
    }

    return image; // pure base64 string

  } catch (e) {
    error("Artwork generation error", { error: e?.message || e });
    throw new Error(`Failed to generate artwork: ${e.message}`);
  }
                      }
